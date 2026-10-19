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
	migrateLegacyBudgetLines
} from '$lib/server/repos/custom-catalog.js';

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

	// Categorías de gasto: las 17 fijas (en orden del catálogo) + las
	// personalizadas del usuario (al final, por nombre).
	const orderIndex = new Map(FIXED_CATEGORIES.map((c, i) => [c.key, i]));
	const fixedCategories = categories
		.filter((c) => !c.isSystem && !c.parentId && !c.isCustom)
		.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			categoryKey: categoryKeyOfDoc(c),
			isCustom: false
		}))
		.filter((c) => orderIndex.has(c.categoryKey))
		.sort((a, b) => orderIndex.get(a.categoryKey) - orderIndex.get(b.categoryKey));

	const customCategories = categories
		.filter((c) => !c.isSystem && !c.parentId && c.isCustom)
		.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			categoryKey: c.categoryKey || null,
			isCustom: true
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));

	const expenseCategories = [...fixedCategories, ...customCategories];
	const expenseById = new Map(expenseCategories.map((c) => [c.id, c]));

	// Subcategorías: fijas del catálogo + personalizadas del usuario, por categoría.
	const catalog = await buildCatalogForUser(userId, categories);
	const subsByCategoryId = catalog.byCategoryId;

	/**
	 * @param {{ id: string, name: string, categoryKey: string|null, isCustom: boolean }} cat
	 * @param {number} generalCents
	 * @param {Map<string, number>|null} storedSubs
	 */
	const buildEntry = (cat, generalCents, storedSubs) => {
		const subDefs = subsByCategoryId.get(cat.id) || [];
		let subSpentSum = 0;

		const subcategories = subDefs.map((s) => {
			const planned = storedSubs?.get(s.key) ?? 0;
			const spent = spentBySub.get(`${cat.id}|${s.key}`) || 0;
			subSpentSum += spent;
			return {
				key: s.key,
				id: s.id ?? null,
				name: s.name,
				isCustom: !!s.isCustom,
				plannedCents: planned,
				plannedPesos: planned ? centsToPesos(planned) : '',
				spentCents: spent
			};
		});

		const spentCents = spentByCategory.get(cat.id) || 0;
		const totalPlannedCents = generalCents + subcategories.reduce((t, s) => t + s.plannedCents, 0);

		return {
			key: cat.id,
			categoryId: cat.id,
			name: cat.name,
			categoryKey: cat.categoryKey,
			isCustom: !!cat.isCustom,
			plannedCents: generalCents,
			plannedPesos: generalCents ? centsToPesos(generalCents) : '',
			totalPlannedCents,
			spentCents,
			// Lo real que no cayó en una subcategoría del catálogo.
			generalSpentCents: Math.max(0, spentCents - subSpentSum),
			subcategories
		};
	};

	// Migración: las categorías personalizadas creadas con el modelo anterior
	// (solo presupuesto, `customKey`) pasan a ser categorías reales.
	let budgetLines = budget?.lines;
	const migrated = await migrateLegacyBudgetLines(userId, budgetLines);
	if (migrated) {
		await setBudgetLines(userId, migrated);
		budgetLines = migrated;
	}

	const compareEntries = (a, b) => {
		if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
		if (a.isCustom) return a.name.localeCompare(b.name, 'es');
		return orderIndex.get(a.categoryKey) - orderIndex.get(b.categoryKey);
	};

	// Si el usuario nunca ha guardado un presupuesto, se listan TODAS las
	// categorías listas para asignarles un monto. Si ya guardó, se respeta su
	// lista (incluyendo lo que haya borrado).
	const hasStoredBudget = Array.isArray(budgetLines);
	/** @type {Array<ReturnType<typeof buildEntry>>} */
	let lines;

	if (hasStoredBudget) {
		/** @type {Map<string, { generalCents: number, subs: Map<string, number> }>} */
		const storedByCat = new Map();
		for (const l of budgetLines) {
			const cid = l.categoryId?.toString?.();
			if (!cid || !expenseById.has(cid)) continue;
			let entry = storedByCat.get(cid);
			if (!entry) {
				entry = { generalCents: 0, subs: new Map() };
				storedByCat.set(cid, entry);
			}
			if (l.subcategoryKey) entry.subs.set(l.subcategoryKey, l.plannedCents || 0);
			else entry.generalCents = l.plannedCents || 0;
		}
		lines = [...storedByCat.entries()]
			.map(([cid, entry]) => buildEntry(expenseById.get(cid), entry.generalCents, entry.subs))
			.sort(compareEntries);
	} else {
		lines = expenseCategories.map((c) => buildEntry(c, 0, null));
	}

	return {
		monthLabel,
		incomeCents: settings?.monthlyIncomeCents ?? null,
		incomePesos: settings?.monthlyIncomeCents ? centsToPesos(settings.monthlyIncomeCents) : '',
		currency: settings?.currency || 'MXN',
		lines,
		// Todas las categorías de gasto (con sus subcategorías), para re-agregar
		// las borradas del presupuesto.
		categories: expenseCategories.map((c) => ({
			id: c.id,
			name: c.name,
			categoryKey: c.categoryKey,
			isCustom: !!c.isCustom,
			subcategories: (subsByCategoryId.get(c.id) || []).map((s) => ({
				key: s.key,
				id: s.id ?? null,
				name: s.name,
				isCustom: !!s.isCustom
			}))
		}))
	};
};

export const actions = {
	save: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();

		const categories = await getCategoriesByUser(userId);
		const expenseCats = categories.filter((c) => !c.isSystem && !c.parentId);
		const validCategoryIds = new Set(expenseCats.map((c) => c._id.toString()));

		const catalog = await buildCatalogForUser(userId, categories);
		const validSubByCat = new Map();
		for (const id of validCategoryIds) {
			const list = catalog.byCategoryId.get(id) || [];
			validSubByCat.set(id, new Set(list.map((s) => s.key)));
		}

		const { lines: parsedLines, hasErrors } = buildBudgetLinesFromForm(formData.entries(), {
			isValidCategory: (id) => validCategoryIds.has(id),
			isValidSubcategory: (id, subKey) => validSubByCat.get(id)?.has(subKey) ?? false
		});

		if (hasErrors) {
			return fail(400, {
				error: 'Hay un importe inválido en el presupuesto. Revisa los montos.'
			});
		}

		const lines = parsedLines.map((l) => ({
			categoryId: l.categoryId ? new ObjectId(l.categoryId) : null,
			subcategoryKey: l.subcategoryKey ?? null,
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

		return { success: true, savedBudget: true };
	},

	// Crea una categoría personalizada real y la agrega al presupuesto.
	createCategory: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
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

		const budget = await getBudget(userId);
		let lines;
		if (Array.isArray(budget?.lines)) {
			lines = [
				...budget.lines,
				{ categoryId: new ObjectId(created.id), subcategoryKey: null, plannedCents: 0 }
			];
		} else {
			// Sin presupuesto guardado: se parte de todas las categorías (en 0).
			lines = categories
				.filter((c) => !c.isSystem && !c.parentId)
				.map((c) => ({ categoryId: c._id, subcategoryKey: null, plannedCents: 0 }));
			lines.push({ categoryId: new ObjectId(created.id), subcategoryKey: null, plannedCents: 0 });
		}

		await setBudgetLines(userId, lines);
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

	// Borra una categoría o subcategoría personalizada (no del catálogo fijo).
	// Los movimientos que la usaban se reasignan a "Sin clasificar" desde el repo.
	deleteCustom: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString().trim() ?? '';

		if (!id) {
			return fail(400, { error: 'ID faltante.' });
		}

		const cat = await deleteCustomCategory(userId, id);
		if (cat.removed) return { success: true, deletedId: id };

		const sub = await deleteCustomSubcategory(userId, id);
		if (sub.removed) return { success: true, deletedId: id };

		return fail(403, { error: 'El catálogo original no se puede eliminar.' });
	}
};
