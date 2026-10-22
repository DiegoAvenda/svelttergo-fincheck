import {
	sumIncomeInRange,
	sumExpensesInRange,
	getRecentMovements,
	deleteMovement
} from '$lib/server/repos/movements.js';
import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import {
	getBudget,
	migrateBudgetPeriods,
	migrateLegacyBudgets,
	resolveCurrentPeriod
} from '$lib/server/repos/budgets.js';
import { getSettings } from '$lib/server/repos/settings.js';
import { currentMonthKey, formatPeriodLabel, monthKeyLabel } from '$lib/utils/periods.js';
import { pctOf, pctOfNullable } from '$lib/utils/spending-math.js';
import {
	sumPlannedCents,
	remainingFromIncome,
	budgetUsedPct,
	plannedCategoryCount
} from '$lib/utils/budget-math.js';
import { movementCategoryLabel } from '$lib/utils/movement-display.js';
import { fail } from '@sveltejs/kit';

export const load = async (event) => {
	const userId = event.locals.user.id;

	const settings = await getSettings(userId);

	let current = await resolveCurrentPeriod(userId);

	// El presupuesto legacy (sin mes) pasa al ciclo actual y se completan
	// los límites de los presupuestos anteriores al modelo de ciclos.
	await migrateLegacyBudgets(userId, currentMonthKey());
	await migrateBudgetPeriods(userId);
	current = await resolveCurrentPeriod(userId);

	const currentKey = current.monthKey;
	const budget = await getBudget(userId, currentKey);

	// Límites reales del ciclo: los guardados mandan en el historial. Si el
	// presupuesto no tiene fechas (legacy) se usa el ciclo resuelto.
	let start;
	let end;
	if (budget?.periodStart instanceof Date && budget?.periodEndExclusive instanceof Date) {
		start = budget.periodStart;
		end = budget.periodEndExclusive;
	} else {
		start = current.start;
		end = current.end;
	}
	const monthLabel = monthKeyLabel(currentKey);
	const periodRangeLabel = formatPeriodLabel(start, end);

	const [incomeCents, expensesCents, rawSpending, recentMovements, categories] = await Promise.all([
		sumIncomeInRange(userId, start, end),
		sumExpensesInRange(userId, start, end),
		getSpendingByCategory(userId, start, end),
		getRecentMovements(userId, 7),
		// Todas las categorías (incluidas las ocultas) para resolver el nombre
		// histórico de cada movimiento.
		getCategoriesByUser(userId)
	]);

	// Resumen del presupuesto (gastos planeados, distintos de los reales).
	const plannedLines = budget?.lines || [];
	const plannedCents = sumPlannedCents(plannedLines);
	const budgetStatus = budget?.status || (budget ? 'confirmed' : null);
	const hasDraft = budgetStatus === 'draft';
	// El ingreso esperado es del ciclo, no global. Solo para el ciclo actual se
	// permite mostrar el ingreso mensual heredado como referencia si el
	// presupuesto todavía no tiene uno guardado. El historial nunca lo usa.
	let budgetIncomeCents = budget?.plannedIncomeCents ?? null;
	if (
		!previewMode &&
		currentKey === realCurrentKey &&
		budgetStatus !== 'draft' &&
		settings?.incomeType !== 'variable' &&
		budgetIncomeCents === null
	) {
		budgetIncomeCents = settings?.monthlyIncomeCents ?? null;
	}
	// Cuenta categorías (con algo planeado), no líneas: una categoría puede
	// tener varias subcategorías. Una propuesta pendiente no cuenta como
	// presupuesto confirmado.
	const plannedCount = plannedCategoryCount(plannedLines);
	const budgetSummary = {
		hasBudget: budgetStatus === 'confirmed' && plannedCount > 0,
		hasDraft,
		status: budgetStatus,
		linesCount: plannedCount,
		plannedCents,
		incomeCents: budgetIncomeCents,
		remainingCents: remainingFromIncome(budgetIncomeCents, plannedCents),
		usedPct: budgetUsedPct(plannedCents, budgetIncomeCents)
	};

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
		periodRangeLabel,
		incomeCents,
		expensesCents,
		balanceCents,
		topCategories,
		budgetSummary,
		recentMovements: serializedRecent,
		createdNotice: createdId ? { id: createdId, type: createdType } : null,
		// Solo dev: datos para el control de simulación de mes.
		preview: dev
			? {
					monthKey: previewMode ? previewKey : null,
					nextMonthKey: shiftMonthKey(previewKey || realCurrentKey, 1)
				}
			: null
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
