import { error, fail, redirect } from '@sveltejs/kit';
import { getMovementById, updateMovement, deleteMovement } from '$lib/server/repos/movements.js';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { ObjectId } from 'mongodb';

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
			status: item.status
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
			note: movement.note || '',
			source: movement.source,
			items: serializedItems
		},
		categories: categories.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			parentId: c.parentId ? c.parentId.toString() : null
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

		const movement = await getMovementById(userId, id);
		if (!movement) {
			return fail(404, { error: 'Movimiento no encontrado' });
		}

		/** @type {any} */
		const updates = {
			merchant: merchant || null,
			note: note || null
		};

		if (dateStr) {
			updates.date = new Date(dateStr + 'T12:00:00Z');
		}

		if (categoryIdStr) {
			updates.categoryId = new ObjectId(categoryIdStr);
		}

		// Si tiene artículos, actualizar categorías de artículos
		if (movement.items && movement.items.length > 0) {
			const updatedItems = [...movement.items];
			for (let i = 0; i < updatedItems.length; i++) {
				const itemCat = formData.get(`item_cat_${i}`)?.toString()?.trim();
				if (itemCat) {
					updatedItems[i].categoryId = new ObjectId(itemCat);
					updatedItems[i].status = 'identified';
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
