import { fail } from '@sveltejs/kit';
import { getCategoriesByUser, updateCategory } from '$lib/server/repos/categories.js';
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
	renameCustomCategory,
	renameCustomSubcategory
} from '$lib/server/repos/custom-catalog.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const categories = await getCategoriesByUser(userId);
	const catalog = await buildCatalogForUser(userId, categories);

	// Padres: fijas (en orden del catálogo) + personalizadas (al final).
	const orderIndex = new Map(FIXED_CATEGORIES.map((c, i) => [c.key, i]));
	const parents = categories
		.filter((c) => !c.parentId && !c.isSystem)
		.sort((a, b) => {
			const ac = !!a.isCustom;
			const bc = !!b.isCustom;
			if (ac !== bc) return ac ? 1 : -1;
			if (ac) return a.name.localeCompare(b.name, 'es');
			return (
				(orderIndex.get(categoryKeyOfDoc(a)) ?? 999) - (orderIndex.get(categoryKeyOfDoc(b)) ?? 999)
			);
		});

	const tree = parents.map((p) => {
		const id = p._id.toString();
		const subs = (catalog.byCategoryId.get(id) || []).map((s) => ({
			key: s.key,
			id: s.id ?? null,
			name: s.name,
			isCustom: !!s.isCustom
		}));
		return {
			id,
			name: p.name,
			isFavorite: !!p.isFavorite,
			isHidden: !!p.isHidden,
			isCustom: !!p.isCustom,
			subcategories: subs
		};
	});

	return {
		categoriesTree: tree,
		parentOptions: parents.map((p) => ({ id: p._id.toString(), name: p.name }))
	};
};

export const actions = {
	// Crea una categoría personalizada (sin parentId) o una subcategoría
	// personalizada dentro de una categoría existente (con parentId).
	create: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const parentId = formData.get('parentId')?.toString().trim() || null;

		if (!name) {
			return fail(400, { error: 'Escribe un nombre.' });
		}

		try {
			if (parentId) {
				await createCustomSubcategory(userId, { categoryId: parentId, name });
			} else {
				const categories = await getCategoriesByUser(userId);
				const normalized = normalizeCategoryName(name);
				const duplicate = categories.some(
					(c) => !c.parentId && normalizeCategoryName(c.name) === normalized
				);
				if (duplicate) {
					return fail(400, { error: 'Ya existe una categoría con ese nombre.' });
				}
				await createCustomCategory(userId, name);
			}
		} catch (err) {
			return fail(400, { error: (err && err.message) || 'No se pudo crear.' });
		}

		return { success: true };
	},

	// Solo se pueden renombrar las categorías/subcategorías personalizadas.
	rename: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString().trim();
		const name = formData.get('name')?.toString().trim() ?? '';

		if (!id || !name) {
			return fail(400, { error: 'Datos incompletos.' });
		}

		try {
			const cat = await renameCustomCategory(userId, id, name);
			if (cat.renamed) return { success: true };

			const sub = await renameCustomSubcategory(userId, id, name);
			if (sub.renamed) return { success: true };
		} catch (err) {
			return fail(400, { error: (err && err.message) || 'No se pudo renombrar.' });
		}

		return fail(403, { error: 'Solo puedes renombrar categorías o subcategorías personalizadas.' });
	},

	toggleFavorite: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString()?.trim();
		const current = formData.get('current') === 'true';

		if (!id) return fail(400, { error: 'ID faltante' });

		await updateCategory(userId, id, { isFavorite: !current });
		return { success: true };
	},

	toggleHidden: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString()?.trim();
		const current = formData.get('current') === 'true';

		if (!id) return fail(400, { error: 'ID faltante' });

		await updateCategory(userId, id, { isHidden: !current });
		return { success: true };
	},

	// Solo se pueden borrar las categorías/subcategorías personalizadas. Al
	// borrar, los movimientos se reasignan a "Sin clasificar" desde el repo.
	delete: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString().trim();

		if (!id) return fail(400, { error: 'ID faltante' });

		const cat = await deleteCustomCategory(userId, id);
		if (cat.removed) return { success: true };

		const sub = await deleteCustomSubcategory(userId, id);
		if (sub.removed) return { success: true };

		return fail(403, { error: 'El catálogo original no se puede eliminar.' });
	}
};
