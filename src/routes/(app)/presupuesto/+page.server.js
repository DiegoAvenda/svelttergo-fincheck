import { dev } from '$app/environment';
import { fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import {
	deleteBudgetById,
	getBudget,
	getEarliestBudgetMonth,
	getPreviousConfirmedBudget,
	migrateBudgetPeriods,
	migrateLegacyBudgets,
	resolveCurrentPeriod,
	setBudget
} from '$lib/server/repos/budgets.js';
import { getSettings } from '$lib/server/repos/settings.js';
import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getSpendingByCategorySubcategory } from '$lib/server/analytics/spending-by-subcategory.js';
import { getEarliestMovementDate, sumIncomeInRange } from '$lib/server/repos/movements.js';
import {
	currentMonthKey,
	formatPeriodLabel,
	getMonthRangeByKey,
	isValidMonthKey,
	monthKeyLabel,
	monthKeyOfDate,
	previousMonthKey,
	shiftMonthKey
} from '$lib/utils/periods.js';
import { parseAmountToCents, centsToPesos } from '$lib/utils/money.js';
import {
	buildBudgetLinesFromForm,
	budgetHasPlanned,
	cloneBudgetLines,
	filterVisibleBudgetLines,
	sumPlannedCents
} from '$lib/utils/budget-math.js';
import {
	FIXED_CATEGORIES,
	categoryKeyOfDoc,
	normalizeCategoryName
} from '$lib/server/defaults/categories.js';
import {
	buildCatalogForUser,
	createCustomCategory,
	createCustomSubcategory,
	deleteCustomCategory,
	deleteCustomSubcategory,
	getCatalogUsage,
	migrateLegacyBudgetLines,
	setCategoryHidden,
	setCustomSubcategoryHidden
} from '$lib/server/repos/custom-catalog.js';

/** @param {string} value */
function capitalize(value) {
	return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Valida que la acción solo se aplique al ciclo actual (los anteriores son
 * de solo lectura).
 * @param {{ locals: { user: { id: string } } }} event
 * @param {FormData} formData
 * @returns {Promise<
 *   | { error: import('@sveltejs/kit').ActionFailure<any> }
 *   | {
 *       userId: string,
 *       monthKey: string,
 *       current: Awaited<ReturnType<typeof resolveCurrentPeriod>>,
 *       settings: Awaited<ReturnType<typeof getSettings>>
 *     }
 * >}
 */
async function requireCurrentMonth(event, formData) {
	const userId = event.locals.user.id;
	const settings = await getSettings(userId);
	const current = await resolveCurrentPeriod(userId);
	const rawMonth = formData.get('month')?.toString().trim() || current.monthKey;

	if (!isValidMonthKey(rawMonth)) {
		return { error: fail(400, { error: 'El mes no es válido.' }) };
	}
	if (rawMonth !== current.monthKey) {
		return { error: fail(403, { error: 'Solo puedes editar el presupuesto del ciclo actual.' }) };
	}

	return { userId, monthKey: current.monthKey, current, settings };
}

export const load = async (event) => {
	const userId = event.locals.user.id;
	const settings = await getSettings(userId);

	// Moderador de pruebas (solo dev): `?previewMonth=YYYY-MM` muestra ese mes
	// como si fuera el actual, en solo lectura. No escribe datos; en producción
	// se ignora por completo.
	const previewParam = dev ? event.url.searchParams.get('previewMonth') : null;
	const previewKey = previewParam && isValidMonthKey(previewParam) ? previewParam : null;

	let current = await resolveCurrentPeriod(userId);
	const previewMode = !!previewKey && previewKey !== current.monthKey;

	if (!previewMode) {
		// El presupuesto legacy (sin mes) pasa al ciclo actual; luego se
		// completan los límites explícitos de los presupuestos existentes.
		await migrateLegacyBudgets(userId, currentMonthKey());
		await migrateBudgetPeriods(userId);
		current = await resolveCurrentPeriod(userId);
	}

	const realCurrentKey = current.monthKey;
	const currentKey = previewKey || realCurrentKey;

	const [categories, usage, earliestBudgetMonth, earliestMovementDate] = await Promise.all([
		getCategoriesByUser(userId),
		getCatalogUsage(userId),
		getEarliestBudgetMonth(userId),
		getEarliestMovementDate(userId)
	]);

	// Navegación: al menos 12 meses atrás y hasta el dato más antiguo
	// (movimiento o presupuesto). Nunca hacia el futuro.
	let minMonthKey = shiftMonthKey(currentKey, -12);
	if (earliestBudgetMonth && earliestBudgetMonth < minMonthKey) minMonthKey = earliestBudgetMonth;
	if (earliestMovementDate) {
		const movementMonth = monthKeyOfDate(earliestMovementDate);
		if (movementMonth < minMonthKey) minMonthKey = movementMonth;
	}
	if (minMonthKey > currentKey) minMonthKey = currentKey;

	const requested = event.url.searchParams.get('month');
	let monthKey = requested && isValidMonthKey(requested) ? requested : currentKey;
	if (monthKey > currentKey) monthKey = currentKey;
	if (monthKey < minMonthKey) monthKey = minMonthKey;

	// En modo prueba el mes simulado es siempre de solo lectura.
	const isCurrentMonth = !previewMode && monthKey === realCurrentKey;

	let budgetDoc = await getBudget(userId, monthKey);

	// Límites reales del periodo: si el presupuesto guardado tiene fechas, se
	// usan esas (historial inmutable). Si no, el ciclo actual resuelto o el
	// cálculo estándar con la configuración vigente.
	const storedStart = budgetDoc?.periodStart instanceof Date ? budgetDoc.periodStart : null;
	const storedEnd =
		budgetDoc?.periodEndExclusive instanceof Date ? budgetDoc.periodEndExclusive : null;
	let range;
	if (storedStart && storedEnd) {
		range = { start: storedStart, end: storedEnd };
	} else if (!previewMode && monthKey === realCurrentKey) {
		range = { start: current.start, end: current.end };
	} else {
		range = getMonthRangeByKey(monthKey);
	}

	const monthLabel = capitalize(monthKeyLabel(monthKey));
	const periodRangeLabel = formatPeriodLabel(range.start, range.end);

	const [spending, subSpending, prevBudget, realIncomeCents] = await Promise.all([
		getSpendingByCategory(userId, range.start, range.end),
		getSpendingByCategorySubcategory(userId, range.start, range.end),
		getPreviousConfirmedBudget(userId, range.start),
		sumIncomeInRange(userId, range.start, range.end)
	]);

	// Migración de líneas legacy (`customKey`) del ciclo consultado. Conserva los
	// importes y no cambia la clasificación de periodos anteriores.
	let budget = budgetDoc;
	let budgetLines = budget?.lines;
	// En modo prueba no se migran ni escriben líneas: la vista es solo lectura.
	if (!previewMode && budget) {
		const migratedLines = await migrateLegacyBudgetLines(userId, budgetLines);
		if (migratedLines) {
			await setBudget(userId, monthKey, {
				lines: migratedLines,
				plannedIncomeCents: budget.plannedIncomeCents ?? null,
				status: budget.status === 'draft' ? 'draft' : 'confirmed',
				replacedConfirmed: !!budget.replacedConfirmed,
				periodStart: range.start,
				periodEndExclusive: range.end
			});
			budget = { ...budget, lines: migratedLines, monthKey };
			budgetLines = migratedLines;
		}
	}

	// Gasto real del periodo, sin filtrar por visibilidad.
	/** @type {Map<string, number>} */
	const spentByCategory = new Map();
	for (const row of spending) {
		const key = row.categoryId ? row.categoryId.toString() : 'null';
		spentByCategory.set(key, (spentByCategory.get(key) || 0) + row.totalCents);
	}

	/** @type {Map<string, number>} */
	const spentBySub = new Map();
	/** @type {Map<string, number>} */
	const subSpentByCategory = new Map();
	for (const row of subSpending) {
		const cid = row.categoryId ? row.categoryId.toString() : 'null';
		const key = `${cid}|${row.subcategoryKey ?? ''}`;
		spentBySub.set(key, (spentBySub.get(key) || 0) + row.totalCents);
		subSpentByCategory.set(cid, (subSpentByCategory.get(cid) || 0) + row.totalCents);
	}
	const totalSpentCents = spending.reduce((total, row) => total + row.totalCents, 0);

	// Catálogo: todas las categorías (incluidas ocultas) para resolver nombres
	// históricos y el catálogo visible para selectores de captura.
	const orderIndex = new Map(FIXED_CATEGORIES.map((c, i) => [c.key, i]));
	const allExpenseCategories = categories
		.filter((c) => !c.isSystem && !c.parentId)
		.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			categoryKey: categoryKeyOfDoc(c),
			isCustom: !!c.isCustom,
			isHidden: !!c.isHidden
		}));
	const categoryById = new Map(allExpenseCategories.map((c) => [c.id, c]));
	const visibleCategories = allExpenseCategories
		.filter((c) => !c.isHidden)
		.sort((a, b) => {
			if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
			if (a.isCustom) return a.name.localeCompare(b.name, 'es');
			return (orderIndex.get(a.categoryKey) ?? 999) - (orderIndex.get(b.categoryKey) ?? 999);
		});

	const catalogAll = await buildCatalogForUser(userId, categories, { includeHidden: true });
	/** @type {Map<string, Set<string>>} */
	const visibleSubKeysByCategory = new Map();
	for (const cat of visibleCategories) {
		const subs = (catalogAll.byCategoryId.get(cat.id) || []).filter((s) => !s.isHidden);
		visibleSubKeysByCategory.set(cat.id, new Set(subs.map((s) => s.key)));
	}

	/** @type {Map<string, string[]>} */
	const customSubKeysByCategory = new Map();
	for (const sub of catalogAll.customSubs) {
		const list = customSubKeysByCategory.get(sub.categoryId) || [];
		list.push(sub.key);
		customSubKeysByCategory.set(sub.categoryId, list);
	}

	// Líneas guardadas del mes: general + subcategorías.
	/** @type {Map<string, {
	 *   generalCents: number,
	 *   subs: Map<string, number>,
	 *   generalLine: any|null,
	 *   subLines: Map<string, any>
	 * }>} */
	const storedByCat = new Map();
	for (const line of budgetLines || []) {
		const cid = line?.categoryId?.toString?.();
		if (!cid) continue;
		let entry = storedByCat.get(cid);
		if (!entry) {
			entry = { generalCents: 0, subs: new Map(), generalLine: null, subLines: new Map() };
			storedByCat.set(cid, entry);
		}
		if (line.subcategoryKey) {
			entry.subs.set(line.subcategoryKey, Number(line.plannedCents) || 0);
			entry.subLines.set(line.subcategoryKey, line);
		} else {
			entry.generalCents = Number(line.plannedCents) || 0;
			entry.generalLine = line;
		}
	}

	const budgetCategoryRefs = new Set(storedByCat.keys());
	/** @type {Set<string>} */
	const budgetSubRefs = new Set();
	for (const entry of storedByCat.values()) {
		for (const key of entry.subs.keys()) budgetSubRefs.add(key);
	}

	/**
	 * Referencias de una categoría (propias o de sus subcategorías).
	 * @param {{ id: string }} cat
	 * @returns {boolean}
	 */
	const categoryHasRefs = (cat) => {
		if (budgetCategoryRefs.has(cat.id) || usage.referencedCategoryIds.has(cat.id)) return true;
		return (customSubKeysByCategory.get(cat.id) || []).some(
			(key) => budgetSubRefs.has(key) || usage.referencedSubcategoryKeys.has(key)
		);
	};

	/**
	 * @param {{ key: string }} sub
	 * @returns {boolean}
	 */
	const subHasRefs = (sub) =>
		budgetSubRefs.has(sub.key) || usage.referencedSubcategoryKeys.has(sub.key);

	/**
	 * Construye la vista de una categoría del presupuesto.
	 * @param {{ id: string, name: string, categoryKey: string|null, isCustom: boolean, isHidden: boolean }} cat
	 * @param {{ generalCents: number, subs: Map<string, number>, subLines?: Map<string, any> }|undefined} stored
	 */
	const buildEntry = (cat, stored) => {
		const allSubDefs = catalogAll.byCategoryId.get(cat.id) || [];
		const storedSubs = stored?.subs || new Map();
		const visibleSubKeys = visibleSubKeysByCategory.get(cat.id) || new Set();

		const subcategories = allSubDefs
			.filter((sub) => {
				const spent = spentBySub.get(`${cat.id}|${sub.key}`) || 0;
				if (cat.isHidden) return storedSubs.has(sub.key) || spent > 0;
				if (sub.isHidden) return storedSubs.has(sub.key) || spent > 0;
				// En el ciclo activo se muestran todas las subcategorías visibles para
				// planear; en histórico solo las que tienen línea o gasto real.
				return isCurrentMonth || storedSubs.has(sub.key) || spent > 0;
			})
			.map((sub) => {
				const planned = storedSubs.get(sub.key) || 0;
				const spent = spentBySub.get(`${cat.id}|${sub.key}`) || 0;
				const hasStored = storedSubs.has(sub.key);
				return {
					key: sub.key,
					id: sub.id ?? null,
					name: sub.name,
					isCustom: !!sub.isCustom,
					isHidden: !!sub.isHidden,
					hasReferences: !!sub.isCustom && subHasRefs(sub),
					plannedCents: planned,
					plannedPesos: planned ? centsToPesos(planned) : '',
					spentCents: spent,
					isStored: hasStored,
					// Las ocultas solo se editan si ya tenían línea guardada.
					canEdit:
						isCurrentMonth &&
						(!sub.isHidden || hasStored) &&
						(visibleSubKeys.has(sub.key) || hasStored)
				};
			});

		// Referencias de subcategoría que ya no existen en el catálogo: se
		// conservan para no perder el importe guardado.
		const definedSubKeys = new Set(allSubDefs.map((sub) => sub.key));
		for (const [key, planned] of storedSubs.entries()) {
			if (definedSubKeys.has(key)) continue;
			const line = stored?.subLines?.get(key);
			subcategories.push({
				key,
				id: null,
				name: line?.subcategoryName || 'Subcategoría no disponible',
				isCustom: true,
				isHidden: true,
				hasReferences: true,
				plannedCents: planned,
				plannedPesos: planned ? centsToPesos(planned) : '',
				spentCents: spentBySub.get(`${cat.id}|${key}`) || 0,
				isStored: true,
				canEdit: false,
				isMissing: true
			});
		}

		const generalCents = stored?.generalCents || 0;
		const totalPlannedCents =
			generalCents + subcategories.reduce((total, sub) => total + sub.plannedCents, 0);
		const spentCents = spentByCategory.get(cat.id) || 0;
		const totalSubSpentCents = subSpentByCategory.get(cat.id) || 0;

		return {
			key: cat.id,
			categoryId: cat.id,
			name: cat.name,
			categoryKey: cat.categoryKey,
			isCustom: !!cat.isCustom,
			isHidden: !!cat.isHidden,
			hasReferences: !!cat.isCustom && categoryHasRefs(cat),
			hasSpending: !!cat.isCustom && usage.categoryIds.has(cat.id),
			plannedCents: generalCents,
			plannedPesos: generalCents ? centsToPesos(generalCents) : '',
			totalPlannedCents,
			spentCents,
			generalSpentCents: Math.max(0, spentCents - totalSubSpentCents),
			isStored: !!stored,
			generalStored: !!stored?.generalLine,
			// En una categoría oculta no se permiten nuevas asignaciones: el
			// monto general solo se edita si ya existía.
			generalCanEdit: isCurrentMonth && (!cat.isHidden || !!stored?.generalLine),
			subcategories
		};
	};

	// Categorías que forman parte del presupuesto de este ciclo.
	/** @type {Set<string>} */
	const lineCategoryIds = new Set();
	if (budget) {
		for (const cid of storedByCat.keys()) {
			if (categoryById.has(cid)) lineCategoryIds.add(cid);
		}
	} else if (isCurrentMonth) {
		// Borrador del ciclo activo: todas las visibles listas para asignar.
		for (const cat of visibleCategories) lineCategoryIds.add(cat.id);
	}

	/** @type {Array<any>} */
	const lines = [...lineCategoryIds]
		.map((cid) => buildEntry(categoryById.get(cid), storedByCat.get(cid)))
		.sort((a, b) => {
			if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
			if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
			if (a.isCustom) return a.name.localeCompare(b.name, 'es');
			return (orderIndex.get(a.categoryKey) ?? 999) - (orderIndex.get(b.categoryKey) ?? 999);
		});

	// Referencias huérfanas: no deberían existir porque el borrado se bloquea,
	// pero se muestran y se conservan para no perder importes históricos.
	for (const [cid, entry] of storedByCat.entries()) {
		if (categoryById.has(cid)) continue;
		const sample = entry.generalLine || [...entry.subLines.values()][0];
		const subcategories = [...entry.subLines.entries()].map(([key, line]) => ({
			key,
			id: null,
			name: line.subcategoryName || key,
			isCustom: true,
			isHidden: true,
			hasReferences: true,
			plannedCents: Number(line.plannedCents) || 0,
			plannedPesos: line.plannedCents ? centsToPesos(line.plannedCents) : '',
			spentCents: 0,
			isStored: true,
			canEdit: false,
			isMissing: true
		}));
		lines.push({
			key: cid,
			categoryId: cid,
			name: sample?.categoryName || 'Categoría no disponible',
			categoryKey: null,
			isCustom: true,
			isHidden: true,
			isMissing: true,
			hasReferences: true,
			hasSpending: false,
			plannedCents: entry.generalCents,
			plannedPesos: entry.generalCents ? centsToPesos(entry.generalCents) : '',
			totalPlannedCents: entry.generalCents + [...entry.subs.values()].reduce((t, v) => t + v, 0),
			spentCents: 0,
			generalSpentCents: 0,
			isStored: true,
			generalStored: !!entry.generalLine,
			generalCanEdit: false,
			subcategories
		});
	}

	// Gasto real que no tiene una línea (ni general ni de subcategoría) en el
	// presupuesto del ciclo. Se muestra aparte y nunca se le asigna un planeado
	// ficticio.
	const budgetedLineIds = new Set(
		lines.filter((line) => !line.isMissing).map((line) => line.categoryId)
	);
	/** @type {Array<{ categoryId: string|null, name: string, isCustom: boolean, isHidden: boolean, spentCents: number }>} */
	const unbudgeted = [];
	for (const [cid, spent] of spentByCategory.entries()) {
		if (!spent) continue;
		if (cid !== 'null' && budgetedLineIds.has(cid)) continue;
		const cat = cid === 'null' ? null : categoryById.get(cid);
		unbudgeted.push({
			categoryId: cid === 'null' ? null : cid,
			name: cat?.name || (cid === 'null' ? 'Sin clasificar' : 'Categoría no disponible'),
			isCustom: !!cat?.isCustom,
			isHidden: !!cat?.isHidden,
			spentCents: spent
		});
	}
	unbudgeted.sort((a, b) => b.spentCents - a.spentCents);
	const unbudgetedCents = unbudgeted.reduce((total, item) => total + item.spentCents, 0);

	const plannedCents = sumPlannedCents(budgetLines);
	const hasStoredBudget = !!budget;
	const hasBudgetLines = Array.isArray(budget?.lines) && budget.lines.length > 0;
	const hasBudgetData = budgetHasPlanned(budgetLines);
	const status = budget?.status || (budget ? 'confirmed' : null);
	const isDraft = status === 'draft';
	const replacedConfirmed = !!budget?.replacedConfirmed;

	// Ingreso esperado del ciclo. Para el ciclo activo se permite prellenar con
	// el ingreso mensual aproximado heredado, pero nunca se usa para el historial.
	let incomeCents = budget?.plannedIncomeCents ?? null;
	let incomeIsFallback = false;
	if (
		isCurrentMonth &&
		!isDraft &&
		settings?.incomeType !== 'variable' &&
		incomeCents === null &&
		settings?.monthlyIncomeCents != null
	) {
		incomeCents = settings.monthlyIncomeCents;
		incomeIsFallback = true;
	}
	const incomePesos = incomeCents != null ? centsToPesos(incomeCents) : '';

	// Referencia del ciclo anterior para la propuesta y el ingreso variable.
	const prevMonthKey = prevBudget?.monthKey || previousMonthKey(monthKey);
	const prevRange =
		prevBudget?.periodStart instanceof Date && prevBudget?.periodEndExclusive instanceof Date
			? { start: prevBudget.periodStart, end: prevBudget.periodEndExclusive }
			: getMonthRangeByKey(prevMonthKey);
	const previousRealIncomeCents = await sumIncomeInRange(userId, prevRange.start, prevRange.end);
	const prevMonthLabel =
		prevBudget?.periodStart instanceof Date && prevBudget?.periodEndExclusive instanceof Date
			? formatPeriodLabel(prevBudget.periodStart, prevBudget.periodEndExclusive)
			: capitalize(monthKeyLabel(prevMonthKey));

	// Opciones de navegación (ciclo actual primero).
	const monthOptions = [];
	let cursor = currentKey;
	let guard = 0;
	while (cursor >= minMonthKey && guard < 240) {
		monthOptions.push({
			key: cursor,
			label: cursor === monthKey ? monthLabel : capitalize(monthKeyLabel(cursor))
		});
		cursor = shiftMonthKey(cursor, -1);
		guard++;
	}

	return {
		monthKey,
		currentMonthKey: realCurrentKey,
		monthLabel,
		periodRangeLabel,
		periodStart: range.start.toISOString(),
		periodEndExclusive: range.end.toISOString(),
		monthOptions,
		isCurrentMonth,
		status,
		isDraft,
		replacedConfirmed,
		// Solo dev: datos para el banner de simulación de mes.
		preview: dev
			? {
					mode: previewMode,
					monthKey: previewMode ? previewKey : null,
					nextMonthKey: shiftMonthKey(previewMode ? previewKey : realCurrentKey, 1)
				}
			: null,
		prevMonthKey,
		nextMonthKey: shiftMonthKey(monthKey, 1),
		canGoPrev: monthKey > minMonthKey,
		canGoNext: monthKey < currentKey,
		prevMonthLabel,
		prevMonthHasBudget: Array.isArray(prevBudget?.lines) && prevBudget.lines.length > 0,
		hasStoredBudget,
		hasBudgetLines,
		hasBudgetData,
		plannedCents,
		spentCents: totalSpentCents,
		realIncomeCents,
		differenceCents: plannedCents - totalSpentCents,
		unbudgeted,
		unbudgetedCents,
		incomeCents,
		incomePesos,
		incomeIsFallback,
		incomeType: settings?.incomeType || null,
		previousRealIncomeCents,
		previousPlannedIncomeCents: prevBudget?.plannedIncomeCents ?? null,
		currency: settings?.currency || 'MXN',
		lines,
		// Solo categorías y subcategorías visibles: son las que se ofrecen para
		// nuevos movimientos o nuevas asignaciones presupuestarias.
		categories: visibleCategories.map((cat) => ({
			id: cat.id,
			name: cat.name,
			categoryKey: cat.categoryKey,
			isCustom: !!cat.isCustom,
			hasReferences: !!cat.isCustom && categoryHasRefs(cat),
			spentCents: spentByCategory.get(cat.id) || 0,
			generalSpentCents: Math.max(
				0,
				(spentByCategory.get(cat.id) || 0) - (subSpentByCategory.get(cat.id) || 0)
			),
			subcategories: (catalogAll.byCategoryId.get(cat.id) || [])
				.filter((sub) => !sub.isHidden)
				.map((sub) => ({
					key: sub.key,
					id: sub.id ?? null,
					name: sub.name,
					isCustom: !!sub.isCustom,
					hasReferences: !!sub.isCustom && subHasRefs(sub),
					spentCents: spentBySub.get(`${cat.id}|${sub.key}`) || 0
				}))
		}))
	};
};

export const actions = {
	save: async (event) => {
		const formData = await event.request.formData();
		const ctx = await requireCurrentMonth(event, formData);
		if ('error' in ctx) return ctx.error;
		const { userId, monthKey, current } = ctx;

		const [categories, existingBudget] = await Promise.all([
			getCategoriesByUser(userId),
			getBudget(userId, monthKey)
		]);
		const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));
		const visibleCats = categories.filter((c) => !c.isSystem && !c.parentId && !c.isHidden);
		const catalogAll = await buildCatalogForUser(userId, categories, { includeHidden: true });

		// Una categoría oculta solo se acepta si ya tenía una línea guardada en
		// este ciclo. Así no se puede inyectar una oculta desde el cliente.
		const existingCategoryIds = new Set(
			(existingBudget?.lines || []).map((line) => line.categoryId?.toString?.()).filter(Boolean)
		);
		/** @type {Map<string, Set<string>>} */
		const existingSubsByCat = new Map();
		for (const line of existingBudget?.lines || []) {
			const cid = line.categoryId?.toString?.();
			if (!cid || !line.subcategoryKey) continue;
			const set = existingSubsByCat.get(cid) || new Set();
			set.add(line.subcategoryKey);
			existingSubsByCat.set(cid, set);
		}

		const allowedCategoryIds = new Set([
			...visibleCats.map((c) => c._id.toString()),
			...existingCategoryIds
		]);
		/** @type {Map<string, Set<string>>} */
		const allowedSubByCat = new Map();
		for (const id of allowedCategoryIds) {
			const cat = categoryById.get(id);
			const set = new Set(existingSubsByCat.get(id) || []);
			if (cat && !cat.isHidden) {
				for (const sub of catalogAll.byCategoryId.get(id) || []) {
					if (!sub.isHidden) set.add(sub.key);
				}
			}
			allowedSubByCat.set(id, set);
		}

		const { lines: parsedLines, hasErrors } = buildBudgetLinesFromForm(formData.entries(), {
			isValidCategory: (id) => allowedCategoryIds.has(id),
			isValidSubcategory: (id, subKey) => allowedSubByCat.get(id)?.has(subKey) ?? false
		});

		if (hasErrors) {
			return fail(400, {
				error: 'Hay un importe inválido en el presupuesto. Revisa los montos.'
			});
		}

		// Una categoría oculta no puede recibir una asignación general nueva:
		// solo se conserva/edita la que ya estaba guardada.
		const hiddenCategoryIds = new Set(
			categories
				.filter((c) => !c.isSystem && !c.parentId && c.isHidden)
				.map((c) => c._id.toString())
		);
		const existingGeneralIds = new Set(
			(existingBudget?.lines || [])
				.filter((line) => !line.subcategoryKey)
				.map((line) => line.categoryId?.toString?.())
				.filter(Boolean)
		);
		const acceptedLines = parsedLines.filter((line) => {
			if (!line.categoryId || line.subcategoryKey) return true;
			if (hiddenCategoryIds.has(line.categoryId) && !existingGeneralIds.has(line.categoryId)) {
				return false;
			}
			return true;
		});

		const lines = acceptedLines.map((line) => {
			const cat = line.categoryId ? categoryById.get(line.categoryId) : null;
			return {
				categoryId: line.categoryId ? new ObjectId(line.categoryId) : null,
				subcategoryKey: line.subcategoryKey ?? null,
				plannedCents: line.plannedCents,
				categoryName: cat?.name || null,
				subcategoryName: line.subcategoryKey
					? catalogAll.labelByKey.get(line.subcategoryKey) || null
					: null
			};
		});

		// Preserva referencias huérfanas que ya no estén en el catálogo para no
		// perder importes. No se pueden crear desde el formulario.
		const parsedCategoryIds = new Set(acceptedLines.map((line) => line.categoryId).filter(Boolean));
		for (const line of existingBudget?.lines || []) {
			const cid = line.categoryId?.toString?.();
			if (!cid || categoryById.has(cid) || parsedCategoryIds.has(cid)) continue;
			lines.push({
				categoryId: line.categoryId,
				subcategoryKey: line.subcategoryKey ?? null,
				plannedCents: Number(line.plannedCents) || 0,
				categoryName: line.categoryName || null,
				subcategoryName: line.subcategoryName || null
			});
		}

		// Lo mismo para subcategorías huérfanas de una categoría que sí existe.
		/** @type {Map<string, Set<string>>} */
		const knownSubsByCat = new Map();
		for (const cat of categories) {
			const cid = cat._id.toString();
			knownSubsByCat.set(
				cid,
				new Set((catalogAll.byCategoryId.get(cid) || []).map((sub) => sub.key))
			);
		}
		const parsedSubKeys = new Set(
			acceptedLines
				.filter((line) => line.categoryId && line.subcategoryKey)
				.map((line) => `${line.categoryId}|${line.subcategoryKey}`)
		);
		for (const line of existingBudget?.lines || []) {
			const cid = line.categoryId?.toString?.();
			if (!cid || !line.subcategoryKey || !categoryById.has(cid)) continue;
			if (knownSubsByCat.get(cid)?.has(line.subcategoryKey)) continue;
			if (parsedSubKeys.has(`${cid}|${line.subcategoryKey}`)) continue;
			lines.push({
				categoryId: line.categoryId,
				subcategoryKey: line.subcategoryKey,
				plannedCents: Number(line.plannedCents) || 0,
				categoryName: line.categoryName || null,
				subcategoryName: line.subcategoryName || null
			});
		}

		// Ingreso esperado del ciclo. Es independiente de los ingresos reales:
		// guardarlo aquí no crea ningún movimiento.
		// Si el formulario no trae el campo (cliente antiguo), se conserva el valor
		// guardado. Si trae el campo vacío, se limpia explícitamente.
		let plannedIncomeCents = existingBudget?.plannedIncomeCents ?? null;
		if (formData.has('plannedIncome') || formData.has('monthlyIncome')) {
			const rawIncome = formData.get('plannedIncome') ?? formData.get('monthlyIncome');
			const incomeStr = rawIncome?.toString().trim() ?? '';
			if (incomeStr !== '') {
				plannedIncomeCents = parseAmountToCents(incomeStr);
				if (plannedIncomeCents === null || plannedIncomeCents < 0) {
					return fail(400, { error: 'El ingreso esperado no es válido.' });
				}
			}
		}

		await setBudget(userId, monthKey, {
			lines,
			plannedIncomeCents,
			status: 'confirmed',
			replacedConfirmed: false,
			periodStart: existingBudget?.periodStart || current.start,
			periodEndExclusive: existingBudget?.periodEndExclusive || current.end
		});

		return { success: true, savedBudget: true, confirmedBudget: true };
	},

	// Crea una propuesta pendiente a partir del último presupuesto confirmado.
	// Nunca modifica el origen ni copia movimientos reales; excluye categorías y
	// subcategorías ocultas del ciclo nuevo.
	propose: async (event) => {
		const formData = await event.request.formData();
		const ctx = await requireCurrentMonth(event, formData);
		if ('error' in ctx) return ctx.error;
		const { userId, monthKey, current, settings } = ctx;

		const [source, target] = await Promise.all([
			getPreviousConfirmedBudget(userId, current.start),
			getBudget(userId, monthKey)
		]);

		if (!source || !Array.isArray(source.lines) || source.lines.length === 0) {
			return fail(400, {
				error: 'El ciclo anterior no tiene un presupuesto confirmado para proponer.'
			});
		}

		const targetHasData =
			!!target && ((target.lines?.length || 0) > 0 || target.status === 'draft');
		if (targetHasData && formData.get('confirm') !== 'true') {
			return fail(409, {
				error:
					'Ya existe un presupuesto o propuesta para este ciclo. Confirma que quieres reemplazarlo.',
				needsCopyConfirm: true
			});
		}

		// El ciclo origen no se modifica. Si hubiera líneas legacy, se migran a
		// categorías reales y se relee el catálogo para incluirlas.
		const sourceLines = (await migrateLegacyBudgetLines(userId, source.lines)) || source.lines;
		const categories = await getCategoriesByUser(userId);
		const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));
		const catalogAll = await buildCatalogForUser(userId, categories, { includeHidden: true });

		const visibleLines = filterVisibleBudgetLines(sourceLines, {
			isCategoryVisible: (cid) => {
				const cat = categoryById.get(cid);
				return !!cat && !cat.isHidden;
			},
			isSubcategoryVisible: (cid, subKey) => {
				const sub = (catalogAll.byCategoryId.get(cid) || []).find(
					(candidate) => candidate.key === subKey
				);
				return !!sub && !sub.isHidden;
			}
		});

		/** @type {any[]} */
		const lines = [];
		for (const line of cloneBudgetLines(visibleLines)) {
			const cid = line.categoryId?.toString?.();
			const cat = cid ? categoryById.get(cid) : null;
			if (!cid || !cat) continue;

			if (line.subcategoryKey) {
				const sub = (catalogAll.byCategoryId.get(cid) || []).find(
					(candidate) => candidate.key === line.subcategoryKey
				);
				if (!sub) continue;
				line.subcategoryName = sub.name;
			}
			line.categoryName = cat.name;
			line.categoryId = cat._id;
			lines.push(line);
		}

		if (lines.length === 0) {
			return fail(400, {
				error: 'El presupuesto anterior no tiene líneas visibles para proponer.'
			});
		}

		const incomeType = settings?.incomeType || null;
		const plannedIncomeCents = incomeType === 'fixed' ? (source.plannedIncomeCents ?? null) : null;

		await setBudget(userId, monthKey, {
			lines,
			plannedIncomeCents,
			status: 'draft',
			// Si reemplaza un presupuesto confirmado con líneas, se marca para
			// impedir que "Descartar" borre el único presupuesto confirmado.
			replacedConfirmed:
				(target?.status === 'confirmed' && (target.lines?.length || 0) > 0) ||
				!!target?.replacedConfirmed,
			periodStart: target?.periodStart || current.start,
			periodEndExclusive: target?.periodEndExclusive || current.end
		});

		const proposedFromLabel =
			source.periodStart instanceof Date && source.periodEndExclusive instanceof Date
				? formatPeriodLabel(source.periodStart, source.periodEndExclusive)
				: capitalize(monthKeyLabel(source.monthKey));

		return {
			success: true,
			proposed: true,
			proposedCount: lines.length,
			proposedFrom: source.monthKey,
			proposedFromLabel,
			plannedIncomeCents
		};
	},

	// Alias de compatibilidad con el flujo anterior de "copiar".
	copyPrevious: async (event) => actions.propose(event),

	discardDraft: async (event) => {
		const formData = await event.request.formData();
		const ctx = await requireCurrentMonth(event, formData);
		if ('error' in ctx) return ctx.error;
		const { userId, monthKey } = ctx;

		const target = await getBudget(userId, monthKey);
		if (!target || target.status !== 'draft') {
			return fail(400, { error: 'No hay una propuesta pendiente para descartar.' });
		}
		if (target.replacedConfirmed) {
			return fail(400, {
				error:
					'Esta propuesta reemplazó un presupuesto confirmado. Edítala y confírmala para no perder los importes.'
			});
		}

		await deleteBudgetById(userId, target._id);
		return { success: true, discardedDraft: true };
	},

	// Crea una categoría personalizada real y la agrega al presupuesto del ciclo
	// actual.
	createCategory: async (event) => {
		const formData = await event.request.formData();
		const ctx = await requireCurrentMonth(event, formData);
		if ('error' in ctx) return ctx.error;
		const { userId, monthKey, current } = ctx;
		const name = formData.get('name')?.toString().trim() ?? '';

		if (!name) {
			return fail(400, { error: 'Escribe un nombre para la categoría.' });
		}

		const categories = await getCategoriesByUser(userId);
		const normalized = normalizeCategoryName(name);
		const duplicate = categories.some(
			(c) => !c.parentId && normalizeCategoryName(c.name) === normalized
		);
		if (duplicate) {
			return fail(400, { error: 'Ya existe una categoría con ese nombre.' });
		}

		const created = await createCustomCategory(userId, name);
		const [freshCategories, budget] = await Promise.all([
			getCategoriesByUser(userId),
			getBudget(userId, monthKey)
		]);

		let lines;
		if (budget) {
			const migrated = await migrateLegacyBudgetLines(userId, budget.lines);
			lines = cloneBudgetLines(migrated || budget.lines);
			if (!lines.some((line) => line.categoryId?.toString?.() === created.id)) {
				lines.push({
					categoryId: new ObjectId(created.id),
					subcategoryKey: null,
					plannedCents: 0,
					categoryName: created.name
				});
			}
		} else {
			lines = freshCategories
				.filter((c) => !c.isSystem && !c.parentId && !c.isHidden)
				.map((c) => ({
					categoryId: c._id,
					subcategoryKey: null,
					plannedCents: 0,
					categoryName: c.name
				}));
		}

		await setBudget(userId, monthKey, {
			lines,
			plannedIncomeCents: budget?.plannedIncomeCents ?? null,
			status: budget?.status === 'draft' ? 'draft' : 'confirmed',
			replacedConfirmed: !!budget?.replacedConfirmed,
			periodStart: budget?.periodStart || current.start,
			periodEndExclusive: budget?.periodEndExclusive || current.end
		});
		return { success: true, createdCategoryId: created.id };
	},

	// Crea una subcategoría personalizada dentro de una categoría (fija o custom).
	createSubcategory: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const categoryId = formData.get('categoryId')?.toString().trim() ?? '';
		const name = formData.get('name')?.toString().trim() ?? '';

		if (!categoryId || !name) {
			return fail(400, { error: 'Escribe un nombre para la subcategoría.' });
		}

		try {
			const created = await createCustomSubcategory(userId, { categoryId, name });
			return { success: true, createdSubcategory: created };
		} catch (err) {
			return fail(400, { error: (err && err.message) || 'No se pudo crear la subcategoría.' });
		}
	},

	// Borra una categoría o subcategoría personalizada solo si no tiene ninguna
	// referencia (movimientos, ítems o presupuesto de cualquier mes).
	deleteCustom: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString().trim() ?? '';

		if (!id) {
			return fail(400, { error: 'ID faltante.' });
		}

		const cat = await deleteCustomCategory(userId, id);
		if (cat.removed) return { success: true, deletedId: id };
		if (cat.blocked) {
			return fail(400, {
				error:
					'No se puede eliminar: tiene movimientos o presupuesto guardado. Usa "Ocultar" para conservar el historial.'
			});
		}

		const sub = await deleteCustomSubcategory(userId, id);
		if (sub.removed) return { success: true, deletedId: id };
		if (sub.blocked) {
			return fail(400, {
				error:
					'No se puede eliminar: tiene movimientos o presupuesto guardado. Usa "Ocultar" para conservar el historial.'
			});
		}

		return fail(403, { error: 'El catálogo original no se puede eliminar.' });
	},

	// Oculta una categoría o subcategoría. Solo cambia su visibilidad en el
	// catálogo: las líneas de presupuesto (incluido este ciclo) se conservan.
	hideCustom: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString().trim() ?? '';

		if (!id) {
			return fail(400, { error: 'ID faltante.' });
		}

		const cat = await setCategoryHidden(userId, id, true);
		if (cat.updated) return { success: true, hiddenId: id };

		const sub = await setCustomSubcategoryHidden(userId, id, true);
		if (sub.updated) return { success: true, hiddenId: id };

		return fail(403, { error: 'Solo puedes ocultar lo personalizado.' });
	}
};
