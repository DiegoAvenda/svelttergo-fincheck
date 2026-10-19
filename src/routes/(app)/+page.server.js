import {
	sumIncomeInRange,
	sumExpensesInRange,
	getRecentMovements,
	deleteMovement
} from '$lib/server/repos/movements.js';
import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { getPeriodRange } from '$lib/utils/periods.js';
import { pctOf, pctOfNullable } from '$lib/utils/spending-math.js';
import { movementCategoryLabel } from '$lib/utils/movement-display.js';
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

	// Top 3 a 5 categorías con porcentaje sobre el gasto total y sobre el ingreso
	const topCategories = rawSpending.slice(0, 5).map((item) => {
		const catName = item.categoryId
			? categoryMap.get(item.categoryId.toString()) || 'Sin clasificar'
			: 'Sin clasificar';
		return {
			categoryId: item.categoryId ? item.categoryId.toString() : null,
			name: catName,
			totalCents: item.totalCents,
			// % del gasto total (denominador = gasto) y % del ingreso (denominador = ingreso).
			pct: pctOf(item.totalCents, expensesCents),
			incomePct: pctOfNullable(item.totalCents, incomeCents)
		};
	});

	// Serializar últimos movimientos
	const serializedRecent = recentMovements.map((m) => {
		return {
			id: m._id.toString(),
			type: m.type,
			amountCents: m.amountCents,
			date: m.date.toISOString(),
			merchant: m.merchant,
			categoryName: movementCategoryLabel(m, categoryMap),
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
