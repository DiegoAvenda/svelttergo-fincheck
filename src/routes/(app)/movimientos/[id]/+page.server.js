import { error, fail, redirect } from '@sveltejs/kit';
import { getMovementById, updateMovement, deleteMovement } from '$lib/server/repos/movements.js';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { ObjectId } from 'mongodb';
import {
	buildCategoryIdByKeyMap,
	buildCategoryKeyByIdMap,
	categoryKeyOfDoc
} from '$lib/server/defaults/categories.js';
import {
	SUBCATEGORIES,
	getCategoryKeyOfSubcategory,
	sanitizeSubcategoryKey,
	subcategoryLabel
} from '$lib/server/defaults/subcategories.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const id = event.params.id;

	const [movement, categories] = await Promise.all([
		getMovementById(userId, id),
		getVisibleCategories(userId)
	]);

	if (!movement) {
		throw error(404, 'Movimiento no encontrado');
	}

	const categoryMap = new Map();
	for (const c of categories) {
		categoryMap.set(c._id.toString(), c.name);
	}

	const serializedItems = (movement.items || []).map((item, index) => {
		const catIdStr = item.categoryId ? item.categoryId.toString() : '';
		return {
			index,
			originalDescription: item.originalDescription,
			amountCents: item.amountCents,
			categoryId: catIdStr,
			categoryName: catIdStr ? categoryMap.get(catIdStr) || 'Sin categoría' : 'Sin clasificar',
			subcategoryKey: item.subcategoryKey || '',
			subcategoryName: item.subcategoryKey ? subcategoryLabel(item.subcategoryKey) : ''
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
			subcategoryName: movement.subcategoryKey ? subcategoryLabel(movement.subcategoryKey) : '',
			note: movement.note || '',
			source: movement.source,
			items: serializedItems
		},
		categories: categories.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			categoryKey: categoryKeyOfDoc(c),
			parentId: c.parentId ? c.parentId.toString() : null
		})),
		subcategories: SUBCATEGORIES.map((s) => ({
			key: s.key,
			name: s.name,
			categoryKey: s.categoryKey
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
		const categories = await getVisibleCategories(userId);
		const categoryIdByKey = buildCategoryIdByKeyMap(categories);
		const categoryKeyById = buildCategoryKeyByIdMap(categories);

		/** @type {any} */
		const updates = {
			merchant: merchant || null,
			note: note || null
		};

		if (dateStr) {
			updates.date = new Date(dateStr + 'T12:00:00Z');
		}

		// Derivar categoría/subcategoría a nivel de movimiento (gastos simples).
		const movementSub = sanitizeSubcategoryKey(subcategoryKeyStr);
		const movementCatKey = movementSub ? getCategoryKeyOfSubcategory(movementSub) : null;
		if (movementCatKey) {
			const derivedId = categoryIdByKey.get(movementCatKey);
			if (derivedId) {
				updates.categoryId = derivedId;
				updates.categoryKey = movementCatKey;
				updates.subcategoryKey = movementSub;
			}
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
				const itemSub = formData.get(`item_subcat_${i}`)?.toString()?.trim();

				const cleanSub = sanitizeSubcategoryKey(itemSub);
				const itemCatKey = cleanSub ? getCategoryKeyOfSubcategory(cleanSub) : null;
				const derivedId = itemCatKey ? categoryIdByKey.get(itemCatKey) : null;

				if (derivedId) {
					updatedItems[i].categoryId = derivedId;
					updatedItems[i].subcategoryKey = cleanSub;
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
