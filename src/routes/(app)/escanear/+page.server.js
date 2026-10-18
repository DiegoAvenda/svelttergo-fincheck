import { fail, redirect } from '@sveltejs/kit';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { createMovement } from '$lib/server/repos/movements.js';
import { upsertClassification } from '$lib/server/repos/classification-memory.js';
import { upsertItemCorrection } from '$lib/server/repos/item-corrections.js';
import { parseTicketImage } from '$lib/server/tickets/parse-ticket.js';
import { classifyItems } from '$lib/server/tickets/classify-items.js';
import { normalizeDescription } from '$lib/utils/normalize-description.js';
import { parseAmountToCents } from '$lib/utils/money.js';
import { todayInMX } from '$lib/utils/periods.js';
import { ObjectId } from 'mongodb';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const categories = await getVisibleCategories(userId);

	// Blindaje UI: el dropdown solo muestra el catálogo fijo (17 + sistema),
	// aunque la BD aún tenga legacy. La auto-migración del layout las limpia.
	const { normalizeCategoryName, fixedCatalogNames } = await import(
		'$lib/server/defaults/categories.js'
	);
	const allowed = new Set(fixedCatalogNames().map((n) => normalizeCategoryName(n)));
	const fixedOnly = categories.filter((c) => allowed.has(normalizeCategoryName(c.name)));
	const visible = fixedOnly.length > 0 ? fixedOnly : categories;

	return {
		categories: visible.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			parentId: c.parentId ? c.parentId.toString() : null,
			isSystem: !!c.isSystem
		}))
	};
};

export const actions = {
	procesar: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		// El form tiene 2 inputs (cámara y galería) con distinto name: tomar el que sí trae archivo.
		const file =
			formData.get('image') instanceof File && formData.get('image').size > 0
				? formData.get('image')
				: formData.get('image_galeria');

		if (!file || !(file instanceof File) || file.size === 0) {
			return fail(400, {
				error: 'Por favor selecciona o toma una foto del ticket.'
			});
		}

		// Validar tamaño máximo (~8 MB)
		const MAX_SIZE = 8 * 1024 * 1024;
		if (file.size > MAX_SIZE) {
			return fail(400, {
				error: 'La imagen excede el límite de 8 MB. Intenta tomar una foto con menor resolución.'
			});
		}

		// Validar tipo de imagen
		const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];
		if (
			!validTypes.includes(file.type.toLowerCase()) &&
			!file.name.match(/\.(jpg|jpeg|png|webp|heic)$/i)
		) {
			return fail(400, {
				error: 'Formato no soportado. Sube una imagen en formato JPG, PNG o WebP.'
			});
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 1. Extraer datos con la IA
		const parseResult = await parseTicketImage(buffer, file.type);
		if (!parseResult.success) {
			return fail(400, {
				error: parseResult.error,
				canManual: true
			});
		}

		// 2. Obtener categorías del usuario para clasificar
		const rawCategories = await getVisibleCategories(userId);

		// 3. Clasificar artículos (memoria + correcciones + IA), con la tienda como contexto
		const classifiedItems = await classifyItems(userId, parseResult.data.items, rawCategories, {
			store: parseResult.data.merchant
		});

		// Mapear para la UI (la descripción ya es editable; se envían raw + itemCode ocultos)
		const itemsForUi = classifiedItems.map((item) => ({
			itemCode: item.itemCode || '',
			rawDescription: item.rawDescription || item.originalDescription || '',
			cleanDescription: item.cleanDescription || item.originalDescription || '',
			originalDescription: item.originalDescription,
			department: item.department || '',
			amountCents: item.amountCents,
			categoryId: item.categoryId ? item.categoryId.toString() : '',
			status: item.status
		}));

		const defaultDateStr = parseResult.data.date || todayInMX().toISOString().slice(0, 10);

		return {
			draft: {
				merchant: parseResult.data.merchant || '',
				date: defaultDateStr,
				totalCents: parseResult.data.totalCents,
				items: itemsForUi
			}
		};
	},

	guardar: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();

		const merchant = formData.get('merchant')?.toString()?.trim() || '';
		const dateStr = formData.get('date')?.toString()?.trim() || '';
		const totalStr = formData.get('total')?.toString()?.trim() || '';
		const onlyTotal = formData.get('onlyTotal')?.toString() === 'true';
		const singleCategoryStr = formData.get('singleCategoryId')?.toString()?.trim() || '';

		const totalCents = parseAmountToCents(totalStr);
		if (totalCents === null || totalCents <= 0) {
			return fail(400, {
				error: 'El total debe ser mayor a $0.00'
			});
		}

		const movementDate = dateStr ? new Date(dateStr + 'T12:00:00Z') : todayInMX();

		if (onlyTotal) {
			// Modo "Solo guardar el total"
			let categoryId = null;
			if (singleCategoryStr) {
				categoryId = new ObjectId(singleCategoryStr);
			} else {
				// Sin categoría elegida: cae a "Sin clasificar" (categoryId null).
				// El sistema muestra null como pendiente de revisión.
				categoryId = null;
			}

			const result = await createMovement(userId, {
				type: 'expense',
				amountCents: totalCents,
				date: movementDate,
				merchant: merchant || null,
				categoryId,
				note: 'Ticket de compra',
				source: 'ticket',
				items: []
			});

			return redirect(303, `/?created=${result.insertedId.toString()}&type=expense`);
		}

		// Modo con detalle de artículos
		const itemsCount = parseInt(formData.get('itemsCount')?.toString() || '0', 10);
		/** @type {any[]} */
		const finalItems = [];

		for (let i = 0; i < itemsCount; i++) {
			const desc = formData.get(`item_desc_${i}`)?.toString()?.trim() || '';
			const rawDesc = formData.get(`item_raw_${i}`)?.toString()?.trim() || desc;
			const itemCode = formData.get(`item_code_${i}`)?.toString()?.trim() || null;
			const department = formData.get(`item_dept_${i}`)?.toString()?.trim() || null;
			const amtStr = formData.get(`item_amount_${i}`)?.toString()?.trim() || '';
			const catStr = formData.get(`item_cat_${i}`)?.toString()?.trim() || '';
			const status = formData.get(`item_status_${i}`)?.toString() || 'identified';

			if (!desc) continue;

			const amtCents = parseAmountToCents(amtStr) || 0;
			const catId = catStr ? new ObjectId(catStr) : null;
			const normalized = normalizeDescription(desc);

			finalItems.push({
				itemCode,
				rawDescription: rawDesc,
				cleanDescription: desc,
				originalDescription: desc,
				normalizedDescription: normalized,
				department,
				amountCents: amtCents,
				categoryId: catId,
				status: catId ? 'identified' : status
			});

			// Upsert en la memoria de clasificación para artículos confirmados
			if (catId && normalized) {
				await upsertClassification(userId, normalized, catId);
			}

			// Aprendizaje por corrección: si el usuario editó la descripción o resolvió
			// un ítem ambiguo/sin categoría, persistir en item_corrections (upsert por
			// itemCode, o por store + rawDescription) para futuras compras.
			const wasAmbiguous = status === 'ambiguous' || !catStr;
			const userEditedDescription =
				normalizeDescription(rawDesc) !== normalized && rawDesc !== desc;
			if (catId && (wasAmbiguous || userEditedDescription || itemCode)) {
				try {
					await upsertItemCorrection(userId, {
						itemCode,
						store: merchant,
						rawDescription: rawDesc,
						correctedDescription: desc,
						categoryId: catId,
						department
					});
				} catch (err) {
					console.error('[guardar] upsertItemCorrection error:', err);
				}
			}
		}

		const result = await createMovement(userId, {
			type: 'expense',
			amountCents: totalCents,
			date: movementDate,
			merchant: merchant || null,
			categoryId: null,
			note: null,
			source: 'ticket',
			items: finalItems
		});

		return redirect(303, `/?created=${result.insertedId.toString()}&type=expense`);
	}
};
