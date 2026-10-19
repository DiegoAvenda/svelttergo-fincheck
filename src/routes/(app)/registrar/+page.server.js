import { fail, redirect } from '@sveltejs/kit';
import { getVisibleCategories } from '$lib/server/repos/categories.js';
import { createMovement, getRecentMovements } from '$lib/server/repos/movements.js';
import { buildCatalogForUser } from '$lib/server/repos/custom-catalog.js';
import { parseAmountToCents } from '$lib/utils/money.js';
import { todayInMX } from '$lib/utils/periods.js';
import { ObjectId } from 'mongodb';
import { buildCategoryKeyByIdMap, categoryKeyOfDoc } from '$lib/server/defaults/categories.js';

export const load = async (event) => {
	const userId = event.locals.user.id;

	const [categories, recent] = await Promise.all([
		getVisibleCategories(userId),
		getRecentMovements(userId, 20)
	]);

	// Contar frecuencia de uso de categorías en recientes
	const usageCount = new Map();
	for (const m of recent) {
		if (m.categoryId) {
			const idStr = m.categoryId.toString();
			usageCount.set(idStr, (usageCount.get(idStr) || 0) + 1);
		}
		if (m.items) {
			for (const item of m.items) {
				if (item.categoryId) {
					const idStr = item.categoryId.toString();
					usageCount.set(idStr, (usageCount.get(idStr) || 0) + 1);
				}
			}
		}
	}

	// Serializar categorías para el cliente
	const serializedCategories = categories.map((c) => ({
		id: c._id.toString(),
		name: c.name,
		categoryKey: categoryKeyOfDoc(c),
		parentId: c.parentId ? c.parentId.toString() : null,
		isFavorite: !!c.isFavorite,
		isSystem: !!c.isSystem,
		isCustom: !!c.isCustom
	}));

	// Top chips: favoritas primero, luego las más usadas
	const favoriteOrFrequent = [...serializedCategories]
		.filter((c) => !c.parentId && !c.isSystem)
		.sort((a, b) => {
			if (a.isFavorite && !b.isFavorite) return -1;
			if (!a.isFavorite && b.isFavorite) return 1;
			const countA = usageCount.get(a.id) || 0;
			const countB = usageCount.get(b.id) || 0;
			return countB - countA;
		})
		.slice(0, 8);

	// Subcategorías del catálogo fijo + las personalizadas del usuario.
	const catalog = await buildCatalogForUser(userId, categories);

	const todayStr = todayInMX().toISOString().slice(0, 10);

	return {
		categories: serializedCategories,
		quickChips: favoriteOrFrequent,
		subcategories: catalog.subs.map((s) => ({
			key: s.key,
			name: s.name,
			categoryId: s.categoryId,
			isCustom: !!s.isCustom
		})),
		todayStr
	};
};

export const actions = {
	default: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();

		const type = formData.get('type')?.toString() === 'income' ? 'income' : 'expense';
		const amountStr = formData.get('amount')?.toString()?.trim() ?? '';
		const categoryIdStr = formData.get('categoryId')?.toString()?.trim() ?? '';
		const subcategoryKeyStr = formData.get('subcategoryKey')?.toString()?.trim() ?? '';
		const dateStr = formData.get('date')?.toString()?.trim() ?? '';
		const merchant = formData.get('merchant')?.toString()?.trim() ?? '';
		const note = formData.get('note')?.toString()?.trim() ?? '';

		const amountCents = parseAmountToCents(amountStr);
		if (amountCents === null || amountCents <= 0) {
			return fail(400, {
				error: 'El importe debe ser mayor a $0.00',
				values: {
					type,
					amount: amountStr,
					categoryId: categoryIdStr,
					date: dateStr,
					merchant,
					note
				}
			});
		}

		if (type === 'expense' && !categoryIdStr) {
			return fail(400, {
				error: 'Selecciona una categoría para el gasto',
				values: {
					type,
					amount: amountStr,
					categoryId: categoryIdStr,
					date: dateStr,
					merchant,
					note
				}
			});
		}

		// Derivar la categoría principal desde la subcategoría y validar coherencia.
		// La subcategoría puede ser del catálogo fijo o personalizada del usuario.
		const categories = await getVisibleCategories(userId);
		const categoryKeyById = buildCategoryKeyByIdMap(categories);
		const catalog = await buildCatalogForUser(userId, categories);

		const rawSubKey = subcategoryKeyStr.trim();
		let subcategoryKey = rawSubKey && catalog.labelByKey.has(rawSubKey) ? rawSubKey : null;
		const subCategoryId = subcategoryKey
			? (catalog.categoryIdBySubKey.get(subcategoryKey) ?? null)
			: null;

		let categoryId = null;
		let categoryKey = null;
		if (subCategoryId) {
			categoryId = new ObjectId(subCategoryId);
			categoryKey = categoryKeyById.get(subCategoryId) ?? null;
		}

		if (type === 'expense' && subcategoryKey && categoryIdStr) {
			if (subCategoryId && subCategoryId !== categoryIdStr) {
				return fail(400, {
					error: 'La subcategoría no pertenece a la categoría seleccionada.',
					values: {
						type,
						amount: amountStr,
						categoryId: categoryIdStr,
						date: dateStr,
						merchant,
						note
					}
				});
			}
		}

		if (!categoryId && categoryIdStr) {
			categoryId = new ObjectId(categoryIdStr);
			categoryKey = categoryKeyById.get(categoryIdStr) ?? null;
			subcategoryKey = null;
		}

		let movementDate;
		if (dateStr) {
			movementDate = new Date(dateStr + 'T12:00:00Z');
		} else {
			movementDate = todayInMX();
		}

		const result = await createMovement(userId, {
			type,
			amountCents,
			date: movementDate,
			merchant: merchant || null,
			categoryId,
			categoryKey,
			subcategoryKey,
			note: note || null,
			source: 'manual',
			items: []
		});

		const insertedId = result.insertedId.toString();
		return redirect(303, `/?created=${insertedId}&type=${type}`);
	}
};
