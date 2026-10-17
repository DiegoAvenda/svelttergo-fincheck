import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { TICKET_PARSER_SYSTEM_PROMPT } from './prompts.js';
import { pesosToCents } from '$lib/utils/money.js';

const parsedTicketSchema = z.object({
	merchant: z.string().nullable().optional(),
	date: z.string().nullable().optional(),
	total: z.number().nonnegative(),
	items: z
		.array(
			z.object({
				originalDescription: z.string().min(1),
				amount: z.number().nonnegative(),
				status: z.enum(['identified', 'ambiguous', 'pending']).default('identified')
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
	const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return {
			success: false,
			error: 'No se ha configurado la clave de Anthropic (ANTHROPIC_API_KEY). Puedes ingresar el ticket manualmente.'
		};
	}

	const model = env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
	const base64Data = imageBuffer.toString('base64');

	// Validar media type compatible
	/** @type {'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'} */
	let mediaType = 'image/jpeg';
	if (mimeType.includes('png')) mediaType = 'image/png';
	else if (mimeType.includes('webp')) mediaType = 'image/webp';
	else if (mimeType.includes('gif')) mediaType = 'image/gif';

	try {
		const anthropic = new Anthropic({ apiKey });

		const response = await anthropic.messages.create({
			model,
			max_tokens: 2048,
			system: TICKET_PARSER_SYSTEM_PROMPT,
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'image',
							source: {
								type: 'base64',
								media_type: mediaType,
								data: base64Data
							}
						},
						{
							type: 'text',
							text: 'Analiza este ticket de compra y devuelve un objeto JSON con los campos: merchant, date, total, e items (con originalDescription, amount, y status).'
						}
					]
				}
			]
		});

		const textBlock = response.content.find((b) => b.type === 'text');
		if (!textBlock || !textBlock.text) {
			return {
				success: false,
				error: 'No se pudo leer el contenido del ticket. Intenta con una foto más nítida o regístralo manualmente.'
			};
		}

		// Extraer JSON (puede venir envuelto en ```json ... ```)
		let jsonText = textBlock.text.trim();
		const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (match) {
			jsonText = match[1].trim();
		}

		let rawJson;
		try {
			rawJson = JSON.parse(jsonText);
		} catch {
			return {
				success: false,
				error: 'La respuesta de la IA no tuvo el formato esperado. Intenta de nuevo o ingresa el ticket manualmente.'
			};
		}

		// Validar con el esquema Zod
		const validation = parsedTicketSchema.safeParse(rawJson);
		if (!validation.success) {
			return {
				success: false,
				error: 'Los datos del ticket no pudieron validarse. Puedes registrarlo manualmente.'
			};
		}

		const data = validation.data;
		const totalCents = pesosToCents(data.total);
		const items = data.items.map((item) => ({
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
		console.error('Error al parsear ticket con Anthropic:', err);
		return {
			success: false,
			error: 'Ocurrió un error al procesar el ticket con la IA. Puedes registrar la compra manualmente.'
		};
	}
}
