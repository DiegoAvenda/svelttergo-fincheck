import { error } from '@sveltejs/kit';
import { getCategoryDetail } from '$lib/server/analytics/category-detail.js';
import { getCategoryById } from '$lib/server/repos/categories.js';
import { getCustomSubcategories } from '$lib/server/repos/custom-catalog.js';
import { getPeriodRange } from '$lib/utils/periods.js';
import { SYSTEM_CATEGORY_UNCLASSIFIED } from '$lib/server/defaults/categories.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const categoryId = event.params.categoriaId;
	const period = event.url.searchParams.get('period') || 'this-month';

	const { start, end, label: periodLabel } = getPeriodRange(/** @type {any} */ (period));

	let categoryName;
	if (categoryId === 'sin-clasificar') {
		categoryName = SYSTEM_CATEGORY_UNCLASSIFIED;
	} else {
		try {
			const cat = await getCategoryById(userId, categoryId);
			if (!cat) {
				throw error(404, 'Categoría no encontrada');
			}
			categoryName = cat.name;
		} catch (err) {
			if (err?.status === 404) throw err;
			throw error(400, 'ID de categoría inválido');
		}
	}

	// Etiquetas de subcategorías personalizadas para el desglose.
	const customSubs = await getCustomSubcategories(userId);
	const customLabelByKey = new Map(customSubs.map((s) => [s.key, s.name]));

	const detail = await getCategoryDetail(
		userId,
		categoryId === 'sin-clasificar' ? null : categoryId,
		start,
		end,
		customLabelByKey
	);

	return {
		categoryId,
		categoryName,
		period,
		periodLabel,
		detail
	};
};
