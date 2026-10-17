import { sumIncomeInRange, sumExpensesInRange, getRecentMovements, deleteMovement } from '$lib/server/repos/movements.js';
import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { getPeriodRange } from '$lib/utils/periods.js';
import { fail } from '@sveltejs/kit';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const settings = event.locals.settings || { monthStartDay: 1, currency: 'MXN' };
	const monthStartDay = settings.monthStartDay || 1;

	const { start, end, label: monthLabel } = getPeriodRange('this-month', monthStartDay);

	const [incomeCents, expensesCents, rawSpending, recentMovements, categories] = await Promise.all([
		sumIncomeInRange(userId, start, end),
		sumExpensesInRange(userId, start, end),
		getSpendingByCategory(userId, start, end),
		getRecentMovements(userId, 7),
		getVisibleCategories(userId)
	]);

	const balanceCents = incomeCents - expensesCents;

	// Crear mapa de nombres de categorías
	const categoryMap = new Map();
	for (const c of categories) {
		categoryMap.set(c._id.toString(), c.name);
	}

	// Top 3 a 5 categorías con porcentaje sobre el gasto total
	const topCategories = rawSpending.slice(0, 5).map((item) => {
		const catName = item.categoryId ? categoryMap.get(item.categoryId.toString()) || 'Sin clasificar' : 'Sin clasificar';
		const pct = expensesCents > 0 ? Math.round((item.totalCents / expensesCents) * 100) : 0;
		return {
			categoryId: item.categoryId ? item.categoryId.toString() : null,
			name: catName,
			totalCents: item.totalCents,
			pct
		};
	});

	// Serializar últimos movimientos
	const serializedRecent = recentMovements.map((m) => {
		const catName = m.categoryId ? categoryMap.get(m.categoryId.toString()) || 'Sin categoría' : 'Sin categoría';
		return {
			id: m._id.toString(),
			type: m.type,
			amountCents: m.amountCents,
			date: m.date.toISOString(),
			merchant: m.merchant,
			categoryName: catName,
			note: m.note,
			source: m.source
		};
	});

	// Verificar si hay aviso de creación reciente
	const createdId = event.url.searchParams.get('created');
	const createdType = event.url.searchParams.get('type');

	return {
		monthLabel,
		incomeCents,
		expensesCents,
		balanceCents,
		topCategories,
		recentMovements: serializedRecent,
		createdNotice: createdId ? { id: createdId, type: createdType } : null
	};
};

export const actions = {
	undo: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString()?.trim();

		if (!id) {
			return fail(400, { error: 'ID faltante' });
		}

		await deleteMovement(userId, id);
		return { undone: true };
	}
};
