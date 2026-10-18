import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { normalizeDescription } from '$lib/utils/normalize-description.js';
import { findClassification } from '$lib/server/repos/classification-memory.js';
import { TICKET_CLASSIFIER_SYSTEM_PROMPT } from './prompts.js';
import { callOpenRouter, extractJson } from '$lib/server/ai/openrouter.js';

const itemClassificationSchema = z.array(
	z.object({
		index: z.number().int().nonnegative(),
		categoryId: z.string().nullable().optional(),
		status: z.enum(['identified', 'ambiguous', 'pending']).default('pending')
	})
);

/**
 * Clasifica los artículos de un ticket:
 * 1. Primero busca en classification_memory por coincidencia exacta de normalizeDescription.
 * 2. Los restantes se envían a Anthropic para asociar a una categoría del usuario.
 * 3. Si la IA falla o no está disponible, se devuelven como "pending".
 *
 * @param {string} userId
 * @param {Array<{ originalDescription: string, amountCents: number, status: 'identified'|'ambiguous'|'pending' }>} items
 * @param {Array<{ _id: import('mongodb').ObjectId, name: string, parentId?: any }>} categories
 * @returns {Promise<Array<{ originalDescription: string, normalizedDescription: string, amountCents: number, categoryId: import('mongodb').ObjectId|null, status: 'identified'|'ambiguous'|'pending' }>>}
 */
export async function classifyItems(userId, items, categories) {
	const { ObjectId } = await import('mongodb');

	// Map de categorías válidas
	const validCategoryIds = new Set(categories.map((c) => c._id.toString()));

	/** @type {Array<{ originalDescription: string, normalizedDescription: string, amountCents: number, categoryId: import('mongodb').ObjectId|null, status: 'identified'|'ambiguous'|'pending' }>} */
	const results = [];
	const pendingForAi = [];

	// Paso 1: Revisar memoria de clasificación primero
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const normalized = normalizeDescription(item.originalDescription);

		const remembered = await findClassification(userId, normalized);
		if (
			remembered &&
			remembered.categoryId &&
			validCategoryIds.has(remembered.categoryId.toString())
		) {
			results[i] = {
				originalDescription: item.originalDescription,
				normalizedDescription: normalized,
				amountCents: item.amountCents,
				categoryId: remembered.categoryId,
				status: 'identified'
			};
		} else {
			results[i] = {
				originalDescription: item.originalDescription,
				normalizedDescription: normalized,
				amountCents: item.amountCents,
				categoryId: null,
				status: item.status || 'pending'
			};
			pendingForAi.push({ index: i, description: item.originalDescription, normalized });
		}
	}

	// Si no hay pendientes de clasificar o no hay categorías, terminamos
	if (pendingForAi.length === 0 || categories.length === 0) {
		return results;
	}

	// Paso 2: Consultar a la IA (OpenRouter free, fallback Anthropic) para los restantes
	const openRouterKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
	const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
	if (!openRouterKey && !anthropicKey) {
		// Degradación elegante: quedan como pendientes
		return results;
	}

	try {
		const catalogList = categories.map((c) => ({ id: c._id.toString(), name: c.name }));

		const prompt = `Catálogo de categorías disponibles:
${JSON.stringify(catalogList, null, 2)}

Artículos a clasificar:
${JSON.stringify(
	pendingForAi.map((p) => ({ index: p.index, description: p.description })),
	null,
	2
)}

Devuelve un JSON array con objetos: { "index": number, "categoryId": string | null, "status": "identified" | "ambiguous" | "pending" }`;

		let text = '';
		if (openRouterKey) {
			const result = await callOpenRouter({
				system: TICKET_CLASSIFIER_SYSTEM_PROMPT,
				max_tokens: 1024,
				temperature: 0.1,
				messages: [{ role: 'user', content: prompt }]
			});
			text = result.text;
		} else {
			text = await callAnthropicClassifier(anthropicKey, prompt);
		}

		if (text) {
			const raw = extractJson(text);
			const validation = itemClassificationSchema.safeParse(raw);

			if (validation.success) {
				for (const itemClass of validation.data) {
					const idx = itemClass.index;
					if (results[idx]) {
						if (itemClass.categoryId && validCategoryIds.has(itemClass.categoryId)) {
							results[idx].categoryId = new ObjectId(itemClass.categoryId);
							results[idx].status = 'identified';
						} else {
							results[idx].status = itemClass.status || 'ambiguous';
						}
					}
				}
			}
		}
	} catch (err) {
		console.error('Error al clasificar artículos con IA:', err);
		// Los artículos quedan en pending
	}

	return results;
}

async function callAnthropicClassifier(apiKey, prompt) {
	const { default: Anthropic } = await import('@anthropic-ai/sdk');
	const model = env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
	const anthropic = new Anthropic({ apiKey });
	const response = await anthropic.messages.create({
		model,
		max_tokens: 1024,
		system: TICKET_CLASSIFIER_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: prompt }]
	});
	const block = response.content.find((b) => b.type === 'text');
	return block?.text || '';
}
