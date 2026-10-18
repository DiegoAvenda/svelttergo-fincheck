import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { upsertItemCorrection } from '$lib/server/repos/item-corrections.js';

const correctionSchema = z.object({
	itemCode: z.string().nullish(),
	store: z.string().nullish(),
	rawDescription: z.string().min(1, 'rawDescription es requerido'),
	correctedDescription: z.string().min(1, 'correctedDescription es requerido'),
	categoryId: z.string().min(1, 'categoryId es requerido'),
	department: z.string().nullish()
});

const batchSchema = z.object({
	corrections: z.array(correctionSchema).min(1).max(100)
});

/**
 * POST /api/item-corrections
 * Persiste el aprendizaje del usuario para ítems ambiguos corregidos manualmente.
 * Body: { itemCode?, store?, rawDescription, correctedDescription, categoryId, department? }
 * o { corrections: [...] } para guardado en lote (el frontend envía lote al confirmar el ticket).
 * Operación upsert: actualiza si existe por itemCode / store+rawDescription, o inserta si es nuevo.
 */
export async function POST(event) {
	const userId = event.locals.user?.id;
	if (!userId) {
		return json({ success: false, error: 'No autenticado' }, { status: 401 });
	}

	let body;
	try {
		body = await event.request.json();
	} catch {
		return json({ success: false, error: 'Body JSON inválido' }, { status: 400 });
	}

	const payload = Array.isArray(body?.corrections)
		? body
		: { corrections: [{ ...body }] };

	const validation = batchSchema.safeParse({
		corrections: payload.corrections.map((c) => ({
			itemCode: c?.itemCode ?? null,
			store: c?.store ?? null,
			rawDescription: (c?.rawDescription || '').toString().trim(),
			correctedDescription: (c?.correctedDescription || c?.cleanDescription || '').toString().trim(),
			categoryId: (c?.categoryId || '').toString().trim(),
			department: c?.department ?? null
		}))
	});

	if (!validation.success) {
		return json(
			{
				success: false,
				error: 'Datos de corrección inválidos',
				issues: validation.error.issues
			},
			{ status: 400 }
		);
	}

	const saved = [];
	for (const c of validation.data.corrections) {
		try {
			await upsertItemCorrection(userId, {
				itemCode: c.itemCode,
				store: c.store,
				rawDescription: c.rawDescription,
				correctedDescription: c.correctedDescription,
				categoryId: c.categoryId,
				department: c.department
			});
			saved.push(c.rawDescription);
		} catch (err) {
			console.error('[POST /api/item-corrections] upsert error:', err);
			return json(
				{ success: false, error: 'No se pudo guardar la corrección. Intenta de nuevo.' },
				{ status: 500 }
			);
		}
	}

	return json({ success: true, saved: saved.length });
}
