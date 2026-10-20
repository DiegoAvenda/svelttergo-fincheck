import { error, fail, redirect } from '@sveltejs/kit';
import { getMovementById, updateMovement, deleteMovement } from '$lib/server/repos/movements.js';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import { buildCatalogForUser } from '$lib/server/repos/custom-catalog.js';
import { ObjectId } from 'mongodb';
import { buildCategoryKeyByIdMap, categoryKeyOfDoc } from '$lib/server/defaults/categories.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const id = event.params.id;

	const [movement, categories] = await Promise.all([
		getMovementById(userId, id),
		// Incluye categorías ocultas: el detalle histórico conserva su nombre y
		// permite editar sin perder la clasificación original.
		getCategoriesByUser(userId)
	]);

	if (!movement) {
		throw error(404, 'Movimiento no encontrado');
	}

	const categoryMap = new Map();
	for (const c of categories) {
		categoryMap.set(c._id.toString(), c.name);
	}

	// Subcategorías fijas + personalizadas: también resuelve sus etiquetas
	// (incluidas las ocultas, para no perder el nombre histórico).
	const catalog = await buildCatalogForUser(userId, categories, { includeHidden: true });
	const labelFor = (key) => (key ? (catalog.labelByKey.get(key) ?? 'Pendiente de revisión') : '');

	const serializedItems = (movement.items || []).map((item, index) => {
		const catIdStr = item.categoryId ? item.categoryId.toString() : '';
		return {
			index,
			originalDescription: item.originalDescription,
			amountCents: item.amountCents,
			categoryId: catIdStr,
			categoryName: catIdStr ? categoryMap.get(catIdStr) || 'Sin categoría' : 'Sin clasificar',
			subcategoryKey: item.subcategoryKey || '',
			subcategoryName: labelFor(item.subcategoryKey)
		};
	});

	const catIdStr = movement.categoryId ? movement.categoryId.toString() : '';

	return {
		movement: {
			id: movement._id.toString(),
			type: movement.type,
			amountCents: movement.amountCents,
			date: movement.date.toISOString().slice(0, 10),
			merchant: movement.merchant || '',
			categoryId: catIdStr,
			categoryName: catIdStr ? categoryMap.get(catIdStr) || 'Sin categoría' : 'Sin categoría',
			subcategoryKey: movement.subcategoryKey || '',
			subcategoryName: labelFor(movement.subcategoryKey),
			note: movement.note || '',
			source: movement.source,
			items: serializedItems
		},
		categories: categories.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			categoryKey: categoryKeyOfDoc(c),
			parentId: c.parentId ? c.parentId.toString() : null,
			isCustom: !!c.isCustom,
			isHidden: !!c.isHidden
		})),
		subcategories: catalog.subs.map((s) => ({
			key: s.key,
			name: s.name,
			categoryId: s.categoryId,
			isCustom: !!s.isCustom,
			isHidden: !!s.isHidden
		}))
	};
};

export const actions = {
	update: async (event) => {
		const userId = event.locals.user.id;
		const id = event.params.id;
		const formData = await event.request.formData();

		const merchant = formData.get('merchant')?.toString()?.trim() ?? '';
		const note = formData.get('note')?.toString()?.trim() ?? '';
		const dateStr = formData.get('date')?.toString()?.trim() ?? '';
		const categoryIdStr = formData.get('categoryId')?.toString()?.trim() ?? '';
		const subcategoryKeyStr = formData.get('subcategoryKey')?.toString()?.trim() ?? '';

		const movement = await getMovementById(userId, id);
		if (!movement) {
			return fail(404, { error: 'Movimiento no encontrado' });
		}

		// Categorías del usuario para derivar la principal desde la subcategoría.
		// Incluye ocultas para respetar la clasificación de un movimiento ya
		// registrado al editarlo.
		const categories = await getCategoriesByUser(userId);
		const categoryKeyById = buildCategoryKeyByIdMap(categories);
		const catalog = await buildCatalogForUser(userId, categories, { includeHidden: true });

		/**
		 * Resuelve categoría/subcategoría a partir de una key (fija o personalizada).
		 * @param {string|null|undefined} subKey
		 */
		const resolve = (subKey) => {
			const raw = (subKey || '').trim();
			if (!raw || !catalog.labelByKey.has(raw)) {
				return { subcategoryKey: null, categoryId: null, categoryKey: null };
			}
			const cid = catalog.categoryIdBySubKey.get(raw) ?? null;
			return {
				subcategoryKey: raw,
				categoryId: cid ? new ObjectId(cid) : null,
				categoryKey: cid ? (categoryKeyById.get(cid) ?? null) : null
			};
		};

		/** @type {any} */
		const updates = {
			merchant: merchant || null,
			note: note || null
		};

		if (dateStr) {
			updates.date = new Date(dateStr + 'T12:00:00Z');
		}

		// Derivar categoría/subcategoría a nivel de movimiento (gastos simples).
		const movementSub = resolve(subcategoryKeyStr);
		if (movementSub.subcategoryKey && movementSub.categoryId) {
			updates.categoryId = movementSub.categoryId;
			updates.categoryKey = movementSub.categoryKey;
			updates.subcategoryKey = movementSub.subcategoryKey;
		} else if (categoryIdStr) {
			updates.categoryId = new ObjectId(categoryIdStr);
			updates.categoryKey = categoryKeyById.get(categoryIdStr) ?? null;
			updates.subcategoryKey = null;
		}

		// Si tiene artículos, actualizar categoría/subcategoría de artículos
		if (movement.items && movement.items.length > 0) {
			const updatedItems = [...movement.items];
			for (let i = 0; i < updatedItems.length; i++) {
				const itemCat = formData.get(`item_cat_${i}`)?.toString()?.trim();
				const itemSubStr = formData.get(`item_subcat_${i}`)?.toString()?.trim();

				const itemSub = resolve(itemSubStr);
				if (itemSub.subcategoryKey && itemSub.categoryId) {
					updatedItems[i].categoryId = itemSub.categoryId;
					updatedItems[i].subcategoryKey = itemSub.subcategoryKey;
				} else if (itemCat) {
					updatedItems[i].categoryId = new ObjectId(itemCat);
					updatedItems[i].subcategoryKey = null;
				}
			}
			updates.items = updatedItems;
		}

		await updateMovement(userId, id, updates);
		return { success: true };
	},

	delete: async (event) => {
		const userId = event.locals.user.id;
		const id = event.params.id;

		await deleteMovement(userId, id);
		return redirect(303, '/movimientos');
	}
};
