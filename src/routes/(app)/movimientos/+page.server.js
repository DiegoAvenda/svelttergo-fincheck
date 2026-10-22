import { listMovements, deleteMovement } from '$lib/server/repos/movements.js';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import { getPeriodRange } from '$lib/utils/periods.js';
import { movementCategoryLabel } from '$lib/utils/movement-display.js';
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
		const range = getPeriodRange(/** @type {any} */ (period));
		startDate = range.start;
		endDate = range.end;
	}

	const [categories, { movements, total }] = await Promise.all([
		// Todas las categorías (incluidas las ocultas): el historial debe seguir
		// mostrando el nombre con el que se registró cada movimiento.
		getCategoriesByUser(userId),
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
		return {
			id: m._id.toString(),
			type: m.type,
			amountCents: m.amountCents,
			date: m.date.toISOString(),
			merchant: m.merchant,
			categoryName: movementCategoryLabel(m, categoryMap),
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
			name: c.name,
			isHidden: !!c.isHidden
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
