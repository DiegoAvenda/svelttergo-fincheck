import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { TICKET_PARSER_SYSTEM_PROMPT } from './prompts.js';
import { pesosToCents } from '$lib/utils/money.js';
import { normalizeTicketItems } from '$lib/utils/ticket-items.js';
import { callOpenRouter, extractJson, openRouterErrorMessage } from '$lib/server/ai/openrouter.js';

const parsedTicketSchema = z.object({
	merchant: z.string().nullable().optional(),
	date: z.string().nullable().optional(),
	total: z.coerce.number().default(0),
	items: z
		.array(
			z.object({
				originalDescription: z.string().nullish().transform((v) => (v || '').trim() || 'Artículo'),
				amount: z.coerce.number().default(0),
				status: z
					.string()
					.nullish()
					.transform((val) => {
						const lower = (val || '').toLowerCase();
						if (lower === 'identified' || lower === 'ambiguous' || lower === 'pending') {
							return lower;
						}
						return 'identified';
					})
			})
		)
		.default([])
});

/**
 * Parsea la imagen de un ticket con la API de Anthropic.
 * @param {Buffer} imageBuffer - Buffer binario de la imagen
 * @param {string} mimeType - 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {Promise<{ success: true, data: { merchant: string|null, date: string|null, totalCents: number, items: Array<{ originalDescription: string, amountCents: number, status: 'identified'|'ambiguous'|'pending' }> } } | { success: false, error: string }>}
 */
export async function parseTicketImage(imageBuffer, mimeType) {
	const openRouterKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
	const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
	if (!openRouterKey && !anthropicKey) {
		return {
			success: false,
			error:
				'No se ha configurado OPENROUTER_API_KEY. Crea una key free en https://openrouter.ai/keys y agregala a tu .env'
		};
	}

	const base64Data = imageBuffer.toString('base64');

	let mediaType = 'image/jpeg';
	if (mimeType.includes('png')) mediaType = 'image/png';
	else if (mimeType.includes('webp')) mediaType = 'image/webp';
	else if (mimeType.includes('gif')) mediaType = 'image/gif';

	// Si hay key de OpenRouter, es el camino principal (modelos free con vision).
	// Si solo hay Anthropic, se mantiene compatibilidad con el codigo anterior.
	const useAnthropicOnly = !openRouterKey && !!anthropicKey;

	try {
		let text;
		if (useAnthropicOnly) {
			text = await callAnthropicVision(anthropicKey, base64Data, mediaType);
		} else {
			const dataUrl = `data:${mediaType};base64,${base64Data}`;
			const result = await callOpenRouter({
				system: TICKET_PARSER_SYSTEM_PROMPT,
				max_tokens: 4096,
				temperature: 0.1,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Extrae los datos de este ticket y responde ÚNICAMENTE con un objeto JSON válido. No incluyas explicaciones, análisis ni texto adicional. Solo el JSON con formato: {"merchant": string|null, "date": string|null, "total": number, "items": [{"originalDescription": string, "amount": number, "status": "identified|ambiguous"}]}.'
							},
							{ type: 'image_url', image_url: { url: dataUrl } }
						]
					}
				]
			});
			text = result.text;
		}

		if (!text) {
			return {
				success: false,
				error:
					'No se pudo leer el contenido del ticket. Intenta con una foto más nítida o regístralo manualmente.'
			};
		}

		let rawJson;
		try {
			rawJson = extractJson(text);
		} catch (err) {
			console.error('[parseTicketImage] extractJson error:', err);
			if (err?.code === 'model_safety_block') {
				return {
					success: false,
					error: openRouterErrorMessage(err)
				};
			}
			return {
				success: false,
				error:
					'La respuesta de la IA no tuvo el formato esperado. Intenta de nuevo o ingresa el ticket manualmente.'
			};
		}

		// Validar con el esquema Zod
		const validation = parsedTicketSchema.safeParse(rawJson);
		if (!validation.success) {
			console.error(
				'[parseTicketImage] Zod validation error:',
				JSON.stringify(validation.error.issues, null, 2)
			);
			return {
				success: false,
				error: 'Los datos del ticket no pudieron validarse. Puedes registrarlo manualmente.'
			};
		}

		const data = validation.data;
		const totalCents = pesosToCents(data.total);
		const normalizedItems = normalizeTicketItems(data.items);
		const items = normalizedItems.map((item) => ({
			originalDescription: item.originalDescription.trim(),
			amountCents: pesosToCents(item.amount),
			status: item.status
		}));

		return {
			success: true,
			data: {
				merchant: data.merchant?.trim() || null,
				date: data.date?.trim() || null,
				totalCents,
				items
			}
		};
	} catch (err) {
		console.error('Error al parsear ticket con IA:', err);
		return {
			success: false,
			error: openRouterErrorMessage(err)
		};
	}
}

async function callAnthropicVision(apiKey, base64Data, mediaType) {
	const { default: Anthropic } = await import('@anthropic-ai/sdk');
	const model = env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
	const anthropic = new Anthropic({ apiKey });
	const response = await anthropic.messages.create({
		model,
		max_tokens: 2048,
		system: TICKET_PARSER_SYSTEM_PROMPT,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
					{
						type: 'text',
						text: 'Extrae los datos de este ticket y responde ÚNICAMENTE con un objeto JSON válido. No incluyas explicaciones, análisis ni texto adicional. Solo el JSON con formato: {"merchant": string|null, "date": string|null, "total": number, "items": [{"originalDescription": string, "amount": number, "status": "identified|ambiguous"}]}.'
					}
				]
			}
		]
	});
	const block = response.content.find((b) => b.type === 'text');
	return block?.text || '';
}
