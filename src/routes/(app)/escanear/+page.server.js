import { fail, redirect } from '@sveltejs/kit';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { createMovement } from '$lib/server/repos/movements.js';
import { upsertItemCorrection } from '$lib/server/repos/item-corrections.js';
import { parseTicketImage } from '$lib/server/tickets/parse-ticket.js';
import { classifyItems } from '$lib/server/tickets/classify-items.js';
import { shouldPersistCorrection } from '$lib/server/tickets/correction-decision.js';
import { parseAmountToCents } from '$lib/utils/money.js';
import { todayInMX } from '$lib/utils/periods.js';
import { ObjectId } from 'mongodb';
import { buildCategoryKeyByIdMap, categoryKeyOfDoc } from '$lib/server/defaults/categories.js';
import { buildCatalogForUser } from '$lib/server/repos/custom-catalog.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const categories = await getVisibleCategories(userId);

	// Blindaje UI: el dropdown muestra el catálogo fijo (17 + sistema) más las
	// categorías personalizadas del usuario. La auto-migración del layout limpia
	// las legacy.
	const { normalizeCategoryName, fixedCatalogNames } =
		await import('$lib/server/defaults/categories.js');
	const allowed = new Set(fixedCatalogNames().map((n) => normalizeCategoryName(n)));
	const fixedOrCustom = categories.filter(
		(c) => !!c.isCustom || allowed.has(normalizeCategoryName(c.name))
	);
	const visible = fixedOrCustom.length > 0 ? fixedOrCustom : categories;

	// Subcategorías: catálogo fijo + personalizadas del usuario.
	const catalog = await buildCatalogForUser(userId, categories);

	return {
		categories: visible.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			categoryKey: categoryKeyOfDoc(c),
			parentId: c.parentId ? c.parentId.toString() : null,
			isSystem: !!c.isSystem,
			isCustom: !!c.isCustom
		})),
		subcategories: catalog.subs.map((s) => ({
			key: s.key,
			name: s.name,
			categoryId: s.categoryId,
			isCustom: !!s.isCustom
		}))
	};
};

/**
 * Resuelve la categoría principal a partir de una subcategoría (fuente de verdad).
 * Acepta subcategorías del catálogo fijo y personalizadas del usuario.
 * @param {string|null|undefined} subcategoryKey
 * @param {{ labelByKey: Map<string,string>, categoryIdBySubKey: Map<string,string> }} catalog
 * @param {Map<string, any>} categoryKeyById
 * @returns {{ subcategoryKey: string|null, categoryKey: string|null, categoryId: any|null }}
 */
function resolveFromSubcategory(subcategoryKey, catalog, categoryKeyById) {
	const raw = (subcategoryKey || '').trim();
	if (!raw || !catalog.labelByKey.has(raw)) {
		return { subcategoryKey: null, categoryKey: null, categoryId: null };
	}
	const categoryIdStr = catalog.categoryIdBySubKey.get(raw) ?? null;
	const categoryKey = categoryIdStr ? (categoryKeyById.get(categoryIdStr) ?? null) : null;
	const categoryId = categoryIdStr ? new ObjectId(categoryIdStr) : null;
	return { subcategoryKey: raw, categoryKey, categoryId };
}

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

		// 3. Clasificar artículos (correcciones + IA por subcategoría), con la tienda como contexto
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
			subcategoryKey: item.subcategoryKey || '',
			// Valores originales de la IA: permiten detectar correcciones del usuario.
			aiCategoryId: item.categoryId ? item.categoryId.toString() : '',
			aiSubcategoryKey: item.subcategoryKey || '',
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
		const singleSubcategoryStr = formData.get('singleSubcategoryKey')?.toString()?.trim() || '';

		const totalCents = parseAmountToCents(totalStr);
		if (totalCents === null || totalCents <= 0) {
			return fail(400, {
				error: 'El total debe ser mayor a $0.00'
			});
		}

		const movementDate = dateStr ? new Date(dateStr + 'T12:00:00Z') : todayInMX();

		// Categorías del usuario para derivar la principal desde la subcategoría.
		const categories = await getVisibleCategories(userId);
		const categoryKeyById = buildCategoryKeyByIdMap(categories);
		const catalog = await buildCatalogForUser(userId, categories);

		if (onlyTotal) {
			// Modo "Solo guardar el total"
			const fromSub = resolveFromSubcategory(singleSubcategoryStr, catalog, categoryKeyById);

			let categoryId = fromSub.categoryId;
			let categoryKey = fromSub.categoryKey;
			let subcategoryKey = fromSub.subcategoryKey;

			// Sin subcategoría válida: se conserva la categoría elegida (o pendiente).
			if (!categoryId && singleCategoryStr) {
				categoryId = new ObjectId(singleCategoryStr);
				categoryKey = categoryKeyById.get(singleCategoryStr) ?? null;
				subcategoryKey = null;
			}

			const result = await createMovement(userId, {
				type: 'expense',
				amountCents: totalCents,
				date: movementDate,
				merchant: merchant || null,
				categoryId,
				categoryKey,
				subcategoryKey,
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
			const subStr = formData.get(`item_subcat_${i}`)?.toString()?.trim() || '';
			const origCatStr = formData.get(`item_cat_orig_${i}`)?.toString()?.trim() || '';
			const origSubStr = formData.get(`item_subcat_orig_${i}`)?.toString()?.trim() || '';
			const origDesc = formData.get(`item_desc_orig_${i}`)?.toString()?.trim() || '';
			const status = formData.get(`item_status_${i}`)?.toString() || 'identified';

			if (!desc) continue;

			const amtCents = parseAmountToCents(amtStr) || 0;

			// La subcategoría manda: si es válida, se deriva la categoría principal.
			const fromSub = resolveFromSubcategory(subStr, catalog, categoryKeyById);
			let catId = fromSub.categoryId;
			let subcategoryKey = fromSub.subcategoryKey;

			// Sin subcategoría: se respeta la categoría elegida (compatibilidad).
			if (!catId && catStr) {
				catId = new ObjectId(catStr);
				subcategoryKey = null;
			}

			// Solo se persiste lo que la app lee del movimiento. Los metadatos del
			// escaneo (itemCode, raw/clean/normalizedDescription, department, status)
			// solo hacen falta durante la revisión y para el aprendizaje en
			// `item_corrections`; no en el movimiento guardado.
			finalItems.push({
				originalDescription: desc,
				amountCents: amtCents,
				categoryId: catId,
				subcategoryKey
			});

			// Aprendizaje por corrección: SOLO si el usuario aclaró un ambiguo
			// o editó la descripción/categoría/subcategoría respecto a lo que
			// propuso la IA. Los ítems que la IA resolvió sola no se memorizan:
			// el historial ya vive en movements.items.
			const persistCorrection = shouldPersistCorrection({
				status,
				categoryId: catId ? catId.toString() : '',
				originalCategoryId: origCatStr,
				subcategoryKey,
				originalSubcategoryKey: origSubStr,
				description: desc,
				originalDescription: origDesc
			});
			if (persistCorrection) {
				try {
					await upsertItemCorrection(userId, {
						itemCode,
						store: merchant,
						rawDescription: rawDesc,
						correctedDescription: desc,
						categoryId: catId,
						subcategoryKey,
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
