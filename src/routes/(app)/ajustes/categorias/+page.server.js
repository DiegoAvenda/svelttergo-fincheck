import { fail } from '@sveltejs/kit';
import {
	getCategoriesByUser,
	createCategory,
	updateCategory,
	deleteCategory,
	categoryHasMovements
} from '$lib/server/repos/categories.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const categories = await getCategoriesByUser(userId);

	// Separar padres e hijos
	const parents = categories.filter((c) => !c.parentId && !c.isSystem);
	const children = categories.filter((c) => c.parentId && !c.isSystem);

	const tree = parents.map((p) => {
		const sub = children.filter((c) => c.parentId.toString() === p._id.toString());
		return {
			id: p._id.toString(),
			name: p.name,
			isFavorite: !!p.isFavorite,
			isHidden: !!p.isHidden,
			subcategories: sub.map((s) => ({
				id: s._id.toString(),
				name: s.name,
				isFavorite: !!s.isFavorite,
				isHidden: !!s.isHidden
			}))
		};
	});

	return {
		categoriesTree: tree,
		parentOptions: parents.map((p) => ({ id: p._id.toString(), name: p.name }))
	};
};

export const actions = {
	create: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const parentId = formData.get('parentId')?.toString()?.trim() || null;

		if (!name) {
			return fail(400, { error: 'El nombre de la categoría es obligatorio' });
		}

		await createCategory(userId, { name, parentId });
		return { success: true };
	},

	rename: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString()?.trim();
		const name = formData.get('name')?.toString()?.trim();

		if (!id || !name) {
			return fail(400, { error: 'Datos incompletos para renombrar' });
		}

		await updateCategory(userId, id, { name });
		return { success: true };
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

	delete: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString()?.trim();

		if (!id) return fail(400, { error: 'ID faltante' });

		const hasMovements = await categoryHasMovements(userId, id);
		if (hasMovements) {
			return fail(400, {
				error: 'No se puede eliminar esta categoría porque tiene movimientos asociados. Puedes ocultarla en su lugar.'
			});
		}

		await deleteCategory(userId, id);
		return { success: true };
	}
};
