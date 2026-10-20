import { dev } from '$app/environment';
import { fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import {
	getBudget,
	setBudgetLines,
	migrateLegacyBudgets,
	getEarliestBudgetMonth
} from '$lib/server/repos/budgets.js';
import { getSettings, updateSettings } from '$lib/server/repos/settings.js';
import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getSpendingByCategorySubcategory } from '$lib/server/analytics/spending-by-subcategory.js';
import { getEarliestMovementDate } from '$lib/server/repos/movements.js';
import {
	currentMonthKey,
	getMonthRangeByKey,
	isValidMonthKey,
	monthKeyFromDate,
	monthKeyLabel,
	previousMonthKey,
	shiftMonthKey
} from '$lib/utils/periods.js';
import { parseAmountToCents, centsToPesos } from '$lib/utils/money.js';
import {
	buildBudgetLinesFromForm,
	budgetHasPlanned,
	cloneBudgetLines,
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
 * Valida que la acción solo se aplique al mes actual (los anteriores son
 * de solo lectura).
 * @param {{ locals: { user: { id: string } } }} event
 * @param {FormData} formData
 * @returns {Promise<
 *   | { error: import('@sveltejs/kit').ActionFailure<any> }
 *   | { userId: string, monthKey: string, currentKey: string }
 * >}
 */
async function requireCurrentMonth(event, formData) {
	const userId = event.locals.user.id;
	const settings = await getSettings(userId);
	const currentKey = currentMonthKey(settings?.monthStartDay || 1);
	const rawMonth = formData.get('month')?.toString().trim() || currentKey;

	if (!isValidMonthKey(rawMonth)) {
		return { error: fail(400, { error: 'El mes no es válido.' }) };
	}
	if (rawMonth !== currentKey) {
		return { error: fail(403, { error: 'Solo puedes editar el presupuesto del mes actual.' }) };
	}

	return { userId, monthKey: currentKey, currentKey };
}

export const load = async (event) => {
	const userId = event.locals.user.id;
	const settings = await getSettings(userId);
	const monthStartDay = settings?.monthStartDay || 1;
	const realCurrentKey = currentMonthKey(monthStartDay);

	// Moderador de pruebas (solo dev): `?previewMonth=YYYY-MM` muestra ese mes
	// como si fuera el actual, en solo lectura. No escribe datos; en producción
	// se ignora por completo.
	const previewParam = dev ? event.url.searchParams.get('previewMonth') : null;
	const previewKey = previewParam && isValidMonthKey(previewParam) ? previewParam : null;
	const previewMode = !!previewKey && previewKey !== realCurrentKey;
	const currentKey = previewKey || realCurrentKey;

	if (!previewMode) {
		// El único presupuesto del modelo anterior era el vigente: se migra al
		// mes actual sin pisar un presupuesto mensual ya existente.
		await migrateLegacyBudgets(userId, currentKey);
	}

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
		const movementMonth = monthKeyFromDate(earliestMovementDate, monthStartDay);
		if (movementMonth < minMonthKey) minMonthKey = movementMonth;
	}
	if (minMonthKey > currentKey) minMonthKey = currentKey;

	const requested = event.url.searchParams.get('month');
	let monthKey = requested && isValidMonthKey(requested) ? requested : currentKey;
	if (monthKey > currentKey) monthKey = currentKey;
	if (monthKey < minMonthKey) monthKey = minMonthKey;

	// En modo prueba el mes simulado es siempre de solo lectura.
	const isCurrentMonth = !previewMode && monthKey === currentKey;
	const range = getMonthRangeByKey(monthKey, monthStartDay);
	const monthLabel = capitalize(range.label);

	const [budgetDoc, spending, subSpending, prevBudget] = await Promise.all([
		getBudget(userId, monthKey),
		getSpendingByCategory(userId, range.start, range.end),
		getSpendingByCategorySubcategory(userId, range.start, range.end),
		isCurrentMonth ? getBudget(userId, previousMonthKey(monthKey)) : Promise.resolve(null)
	]);

	// Migración de líneas legacy (`customKey`) del mes consultado. Conserva los
	// importes y no cambia la clasificación de meses anteriores.
	let budget = budgetDoc;
	let budgetLines = budget?.lines;
	// En modo prueba no se migran ni escriben líneas: la vista es solo lectura.
	const migratedLines = previewMode ? null : await migrateLegacyBudgetLines(userId, budgetLines);
	if (migratedLines) {
		await setBudgetLines(userId, monthKey, migratedLines);
		budget = { ...(budget || {}), lines: migratedLines, monthKey };
		budgetLines = migratedLines;
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
				// En el mes activo se muestran todas las subcategorías visibles para
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

	// Categorías que forman parte del presupuesto de este mes.
	/** @type {Set<string>} */
	const lineCategoryIds = new Set();
	if (budget) {
		for (const cid of storedByCat.keys()) {
			if (categoryById.has(cid)) lineCategoryIds.add(cid);
		}
	} else if (isCurrentMonth) {
		// Borrador del mes activo: todas las visibles listas para asignar.
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
	// presupuesto del mes. Se muestra aparte y nunca se le asigna un planeado
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

	// Opciones de navegación (mes actual primero).
	const monthOptions = [];
	let cursor = currentKey;
	let guard = 0;
	while (cursor >= minMonthKey && guard < 240) {
		monthOptions.push({ key: cursor, label: capitalize(monthKeyLabel(cursor)) });
		cursor = shiftMonthKey(cursor, -1);
		guard++;
	}

	return {
		monthKey,
		currentMonthKey: currentKey,
		monthLabel,
		monthOptions,
		isCurrentMonth,
		// Solo dev: datos para el banner de simulación de mes.
		preview: dev
			? {
					mode: previewMode,
					monthKey: previewMode ? previewKey : null,
					nextMonthKey: shiftMonthKey(previewMode ? previewKey : realCurrentKey, 1)
				}
			: null,
		prevMonthKey: shiftMonthKey(monthKey, -1),
		nextMonthKey: shiftMonthKey(monthKey, 1),
		canGoPrev: monthKey > minMonthKey,
		canGoNext: monthKey < currentKey,
		prevMonthLabel: capitalize(monthKeyLabel(previousMonthKey(monthKey))),
		prevMonthHasBudget: Array.isArray(prevBudget?.lines) && prevBudget.lines.length > 0,
		hasStoredBudget,
		hasBudgetLines,
		hasBudgetData,
		plannedCents,
		spentCents: totalSpentCents,
		differenceCents: plannedCents - totalSpentCents,
		unbudgeted,
		unbudgetedCents,
		incomeCents: settings?.monthlyIncomeCents ?? null,
		incomePesos: settings?.monthlyIncomeCents ? centsToPesos(settings.monthlyIncomeCents) : '',
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
		const { userId, monthKey } = ctx;

		const [categories, existingBudget] = await Promise.all([
			getCategoriesByUser(userId),
			getBudget(userId, monthKey)
		]);
		const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));
		const visibleCats = categories.filter((c) => !c.isSystem && !c.parentId && !c.isHidden);
		const catalogAll = await buildCatalogForUser(userId, categories, { includeHidden: true });

		// Una categoría oculta solo se acepta si ya tenía una línea guardada en
		// este mes. Así no se puede inyectar una oculta desde el cliente.
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

		/** @type {{ monthlyIncomeCents?: number|null }} */
		const settingsUpdates = {};
		if (formData.has('monthlyIncome')) {
			const incomeStr = formData.get('monthlyIncome')?.toString().trim() ?? '';
			if (incomeStr !== '') {
				const parsedIncome = parseAmountToCents(incomeStr);
				if (parsedIncome === null || parsedIncome < 0) {
					return fail(400, { error: 'El ingreso mensual no es válido.' });
				}
				settingsUpdates.monthlyIncomeCents = parsedIncome;
			} else {
				settingsUpdates.monthlyIncomeCents = null;
			}
		}

		await Promise.all([
			setBudgetLines(userId, monthKey, lines),
			Object.keys(settingsUpdates).length > 0
				? updateSettings(userId, settingsUpdates)
				: Promise.resolve()
		]);

		return { success: true, savedBudget: true };
	},

	// Copia el presupuesto del mes anterior al mes actual. Nunca modifica el
	// origen ni duplica movimientos reales.
	copyPrevious: async (event) => {
		const formData = await event.request.formData();
		const ctx = await requireCurrentMonth(event, formData);
		if ('error' in ctx) return ctx.error;
		const { userId, monthKey } = ctx;
		const sourceKey = previousMonthKey(monthKey);

		const [source, target, categories] = await Promise.all([
			getBudget(userId, sourceKey),
			getBudget(userId, monthKey),
			getCategoriesByUser(userId)
		]);

		if (!source || !Array.isArray(source.lines) || source.lines.length === 0) {
			return fail(400, {
				error: 'El mes anterior no tiene un presupuesto guardado para copiar.'
			});
		}

		const targetHasData = Array.isArray(target?.lines) && target.lines.length > 0;
		if (targetHasData && formData.get('confirm') !== 'true') {
			return fail(409, {
				error: 'Ya existe un presupuesto para este mes. Confirma que quieres reemplazarlo.',
				needsCopyConfirm: true
			});
		}

		// La migración de líneas legacy se hace en memoria: el mes origen no se
		// modifica.
		const sourceLines = (await migrateLegacyBudgetLines(userId, source.lines)) || source.lines;
		const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));
		const catalogAll = await buildCatalogForUser(userId, categories, { includeHidden: true });

		/** @type {any[]} */
		const lines = [];
		for (const line of cloneBudgetLines(sourceLines)) {
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
			lines.push(line);
		}

		if (lines.length === 0) {
			return fail(400, {
				error: 'El presupuesto del mes anterior no tiene líneas válidas para copiar.'
			});
		}

		await setBudgetLines(userId, monthKey, lines);
		return {
			success: true,
			copiedPrevious: true,
			copiedCount: lines.length,
			copiedFrom: sourceKey
		};
	},

	// Crea una categoría personalizada real y la agrega al presupuesto del mes
	// actual.
	createCategory: async (event) => {
		const formData = await event.request.formData();
		const ctx = await requireCurrentMonth(event, formData);
		if ('error' in ctx) return ctx.error;
		const { userId, monthKey } = ctx;
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

		await setBudgetLines(userId, monthKey, lines);
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
	// catálogo: las líneas de presupuesto (incluido este mes) se conservan.
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
