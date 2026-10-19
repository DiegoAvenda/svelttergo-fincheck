import { fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import { getBudget, setBudgetLines } from '$lib/server/repos/budgets.js';
import { getSettings, updateSettings } from '$lib/server/repos/settings.js';
import { getSpendingByCategory } from '$lib/server/analytics/spending-by-category.js';
import { getSpendingByCategorySubcategory } from '$lib/server/analytics/spending-by-subcategory.js';
import { getPeriodRange } from '$lib/utils/periods.js';
import { parseAmountToCents, centsToPesos } from '$lib/utils/money.js';
import { buildBudgetLinesFromForm } from '$lib/utils/budget-math.js';
import { FIXED_CATEGORIES, categoryKeyOfDoc } from '$lib/server/defaults/categories.js';
import { SUBCATEGORIES } from '$lib/server/defaults/subcategories.js';

export const load = async (event) => {
	const userId = event.locals.user.id;

	const [settings, categories, budget] = await Promise.all([
		getSettings(userId),
		getCategoriesByUser(userId),
		getBudget(userId)
	]);

	const monthStartDay = settings?.monthStartDay || 1;
	const { start, end, label: monthLabel } = getPeriodRange('this-month', monthStartDay);

	// Gasto REAL del periodo: por categoría y por categoría+subcategoría.
	const [spending, subSpending] = await Promise.all([
		getSpendingByCategory(userId, start, end),
		getSpendingByCategorySubcategory(userId, start, end)
	]);

	const spentByCategory = new Map();
	for (const s of spending) {
		spentByCategory.set(s.categoryId ? s.categoryId.toString() : 'null', s.totalCents);
	}

	const spentBySub = new Map();
	for (const s of subSpending) {
		const cid = s.categoryId ? s.categoryId.toString() : 'null';
		spentBySub.set(`${cid}|${s.subcategoryKey ?? ''}`, s.totalCents);
	}

	// Categorías fijas de gasto (sin sistema ni subcategorías), en orden del catálogo.
	const orderIndex = new Map(FIXED_CATEGORIES.map((c, i) => [c.key, i]));
	const fixedCategories = categories
		.filter((c) => !c.isSystem && !c.parentId)
		.map((c) => ({ id: c._id.toString(), name: c.name, categoryKey: categoryKeyOfDoc(c) }))
		.filter((c) => orderIndex.has(c.categoryKey))
		.sort((a, b) => orderIndex.get(a.categoryKey) - orderIndex.get(b.categoryKey));

	const fixedById = new Map(fixedCategories.map((c) => [c.id, c]));

	// Subcategorías del catálogo agrupadas por categoría principal.
	const subsByCategoryKey = new Map();
	for (const s of SUBCATEGORIES) {
		if (!subsByCategoryKey.has(s.categoryKey)) subsByCategoryKey.set(s.categoryKey, []);
		subsByCategoryKey.get(s.categoryKey).push({ key: s.key, name: s.name });
	}

	/**
	 * @param {{ id: string, name: string, categoryKey: string }} cat
	 * @param {number} generalCents
	 * @param {Map<string, number>|null} storedSubs
	 */
	const buildEntry = (cat, generalCents, storedSubs) => {
		const catalogSubs = subsByCategoryKey.get(cat.categoryKey) || [];
		let subSpentSum = 0;

		const subcategories = catalogSubs.map((s) => {
			const planned = storedSubs?.get(s.key) ?? 0;
			const spent = spentBySub.get(`${cat.id}|${s.key}`) || 0;
			subSpentSum += spent;
			return {
				key: s.key,
				name: s.name,
				plannedCents: planned,
				plannedPesos: planned ? centsToPesos(planned) : '',
				spentCents: spent
			};
		});

		const spentCents = spentByCategory.get(cat.id) || 0;
		const totalPlannedCents = generalCents + subcategories.reduce((t, s) => t + s.plannedCents, 0);

		return {
			categoryId: cat.id,
			name: cat.name,
			categoryKey: cat.categoryKey,
			plannedCents: generalCents,
			plannedPesos: generalCents ? centsToPesos(generalCents) : '',
			totalPlannedCents,
			spentCents,
			// Lo real que no cayó en una subcategoría del catálogo.
			generalSpentCents: Math.max(0, spentCents - subSpentSum),
			subcategories
		};
	};

	// Si el usuario nunca ha guardado un presupuesto, se listan TODAS las
	// categorías listas para asignarles un monto. Si ya guardó, se respeta su
	// lista (incluyendo lo que haya borrado).
	const hasStoredBudget = Array.isArray(budget?.lines);
	/** @type {ReturnType<typeof buildEntry>[]} */
	let lines;

	if (hasStoredBudget) {
		/** @type {Map<string, { generalCents: number, subs: Map<string, number> }>} */
		const storedByCat = new Map();
		for (const l of budget.lines) {
			const cid = l.categoryId?.toString?.();
			if (!cid || !fixedById.has(cid)) continue;
			let entry = storedByCat.get(cid);
			if (!entry) {
				entry = { generalCents: 0, subs: new Map() };
				storedByCat.set(cid, entry);
			}
			if (l.subcategoryKey) entry.subs.set(l.subcategoryKey, l.plannedCents || 0);
			else entry.generalCents = l.plannedCents || 0;
		}
		lines = [...storedByCat.entries()]
			.map(([cid, entry]) => buildEntry(fixedById.get(cid), entry.generalCents, entry.subs))
			.sort((a, b) => orderIndex.get(a.categoryKey) - orderIndex.get(b.categoryKey));
	} else {
		lines = fixedCategories.map((c) => buildEntry(c, 0, null));
	}

	return {
		monthLabel,
		incomeCents: settings?.monthlyIncomeCents ?? null,
		incomePesos: settings?.monthlyIncomeCents ? centsToPesos(settings.monthlyIncomeCents) : '',
		currency: settings?.currency || 'MXN',
		lines,
		// Todas las categorías (con sus subcategorías), para re-agregar las borradas.
		categories: fixedCategories.map((c) => ({
			id: c.id,
			name: c.name,
			categoryKey: c.categoryKey,
			subcategories: subsByCategoryKey.get(c.categoryKey) || []
		}))
	};
};

export const actions = {
	save: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();

		const categories = await getCategoriesByUser(userId);
		const fixed = categories.filter((c) => !c.isSystem && !c.parentId);
		const keyById = new Map(fixed.map((c) => [c._id.toString(), categoryKeyOfDoc(c)]));

		// Subcategorías válidas por categoría (para no aceptar combinaciones incoherentes).
		const validSubByCat = new Map();
		for (const [id, catKey] of keyById) {
			validSubByCat.set(
				id,
				new Set(SUBCATEGORIES.filter((s) => s.categoryKey === catKey).map((s) => s.key))
			);
		}

		const { lines: parsedLines, hasErrors } = buildBudgetLinesFromForm(formData.entries(), {
			isValidCategory: (id) => keyById.has(id),
			isValidSubcategory: (id, subKey) => validSubByCat.get(id)?.has(subKey) ?? false
		});

		if (hasErrors) {
			return fail(400, {
				error: 'Hay un importe inválido en el presupuesto. Revisa los montos.'
			});
		}

		const lines = parsedLines.map((l) => ({
			categoryId: new ObjectId(l.categoryId),
			subcategoryKey: l.subcategoryKey,
			plannedCents: l.plannedCents
		}));

		const incomeStr = formData.get('monthlyIncome')?.toString().trim() ?? '';
		let monthlyIncomeCents = null;
		if (incomeStr !== '') {
			const parsedIncome = parseAmountToCents(incomeStr);
			if (parsedIncome === null || parsedIncome < 0) {
				return fail(400, { error: 'El ingreso mensual no es válido.' });
			}
			monthlyIncomeCents = parsedIncome;
		}

		await Promise.all([
			setBudgetLines(userId, lines),
			updateSettings(userId, { monthlyIncomeCents })
		]);

		return { success: true };
	}
};
