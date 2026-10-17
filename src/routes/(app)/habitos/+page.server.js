import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getPeriodComparison } from '$lib/server/analytics/period-comparison.js';
import { getVisibleCategories, getCategoriesByUser } from '$lib/server/repos/categories.js';
import { getSettings } from '$lib/server/repos/settings.js';
import { sumIncomeInRange } from '$lib/server/repos/movements.js';
import { getPeriodRange, getComparisonRange } from '$lib/utils/periods.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const period = event.url.searchParams.get('period') || 'this-month';

	const settings = await getSettings(userId);
	const monthStartDay = settings?.monthStartDay || 1;

	const currentRange = getPeriodRange(/** @type {any} */ (period), monthStartDay);
	const comparisonRange = getComparisonRange(currentRange);

	const [spending, comparisonMap, registeredIncome, allCategories] = await Promise.all([
		getSpendingByCategory(userId, currentRange.start, currentRange.end),
		getPeriodComparison(userId, currentRange, comparisonRange),
		sumIncomeInRange(userId, currentRange.start, currentRange.end),
		getCategoriesByUser(userId)
	]);

	// Calcular ingresos base para el porcentaje:
	// 1. Ingresos registrados en el periodo
	// 2. Si no hay, usar ingreso mensual de settings (escalado al periodo)
	// 3. Si tampoco hay, null (ocultar porcentaje)
	let baseIncomeCents = null;
	if (registeredIncome > 0) {
		baseIncomeCents = registeredIncome;
	} else if (settings?.monthlyIncomeCents && settings.monthlyIncomeCents > 0) {
		const multiplier = period === 'last-3-months' ? 3 : 1;
		baseIncomeCents = settings.monthlyIncomeCents * multiplier;
	}

	// Mapeo de categorías
	const categoryMap = new Map();
	for (const c of allCategories) {
		categoryMap.set(c._id.toString(), c);
	}

	let totalSpendingCents = 0;
	for (const s of spending) {
		totalSpendingCents += s.totalCents;
	}

	const categoriesList = spending.map((s) => {
		const key = s.categoryId ? s.categoryId.toString() : 'null';
		const catDoc = s.categoryId ? categoryMap.get(key) : null;
		const name = catDoc ? catDoc.name : 'Sin clasificar';

		const comp = comparisonMap.get(key);
		const changePct = comp?.changePct ?? null;

		const incomePct = baseIncomeCents && baseIncomeCents > 0 ? Math.round((s.totalCents / baseIncomeCents) * 100) : null;
		const totalPct = totalSpendingCents > 0 ? Math.round((s.totalCents / totalSpendingCents) * 100) : 0;

		return {
			categoryId: s.categoryId ? key : 'sin-clasificar',
			name,
			totalCents: s.totalCents,
			count: s.count,
			incomePct,
			totalPct,
			changePct
		};
	});

	return {
		period,
		periodLabel: currentRange.label,
		categoriesList,
		totalSpendingCents,
		hasIncomeRef: baseIncomeCents !== null
	};
};
