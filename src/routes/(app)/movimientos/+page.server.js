import { listMovements, deleteMovement } from '$lib/server/repos/movements.js';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { getPeriodRange } from '$lib/utils/periods.js';
import { fail } from '@sveltejs/kit';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const url = event.url;

	const search = url.searchParams.get('q')?.trim() || '';
	const period = url.searchParams.get('period') || 'this-month';
	const categoryId = url.searchParams.get('cat')?.trim() || '';
	const limit = Math.max(10, parseInt(url.searchParams.get('limit') || '20', 10));

	let startDate = undefined;
	let endDate = undefined;

	if (period !== 'all') {
		const range = getPeriodRange(/** @type {any} */ (period), 1);
		startDate = range.start;
		endDate = range.end;
	}

	const [categories, { movements, total }] = await Promise.all([
		getVisibleCategories(userId),
		listMovements(userId, {
			search: search || undefined,
			categoryId: categoryId || undefined,
			startDate,
			endDate,
			limit
		})
	]);

	// Crear mapa de nombres de categorías
	const categoryMap = new Map();
	for (const c of categories) {
		categoryMap.set(c._id.toString(), c.name);
	}

	// Serializar movimientos
	const serializedMovements = movements.map((m) => {
		const catName = m.categoryId ? categoryMap.get(m.categoryId.toString()) || 'Sin categoría' : 'Sin categoría';
		return {
			id: m._id.toString(),
			type: m.type,
			amountCents: m.amountCents,
			date: m.date.toISOString(),
			merchant: m.merchant,
			categoryName: catName,
			categoryId: m.categoryId ? m.categoryId.toString() : null,
			note: m.note,
			source: m.source,
			itemsCount: m.items?.length || 0
		};
	});

	const serializedCategories = categories
		.filter((c) => !c.isSystem)
		.map((c) => ({
			id: c._id.toString(),
			name: c.name
		}));

	return {
		movements: serializedMovements,
		total,
		limit,
		categories: serializedCategories,
		filters: {
			search,
			period,
			categoryId
		}
	};
};

export const actions = {
	delete: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString()?.trim();

		if (!id) {
			return fail(400, { error: 'ID de movimiento no proporcionado' });
		}

		await deleteMovement(userId, id);
		return { success: true };
	}
};
