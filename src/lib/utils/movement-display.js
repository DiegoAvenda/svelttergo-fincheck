import { SYSTEM_CATEGORY_UNCLASSIFIED } from '../server/defaults/categories.js';

/**
 * Etiqueta de categoría para mostrar un movimiento.
 *
 * Los tickets con desglose guardan la categoría por artículo y dejan
 * `movement.categoryId = null` (el gasto se reparte entre categorías/
 * subcategorías). En ese caso se deriva la etiqueta a partir de los artículos:
 *  - una sola categoría  -> su nombre
 *  - varias categorías   -> "Varias categorías"
 *  - sin clasificar      -> "Sin clasificar"
 *
 * @param {{ categoryId?: { toString(): string }|null, items?: Array<{ categoryId?: { toString(): string }|null }> }|null} movement
 * @param {Map<string, string>} categoryNameById
 * @returns {string}
 */
export function movementCategoryLabel(movement, categoryNameById) {
	const direct = movement?.categoryId;
	if (direct) {
		return categoryNameById.get(direct.toString()) || SYSTEM_CATEGORY_UNCLASSIFIED;
	}

	const items = Array.isArray(movement?.items) ? movement.items : [];
	const names = new Set();
	for (const item of items) {
		const id = item?.categoryId;
		if (!id) continue;
		const name = categoryNameById.get(id.toString());
		if (name) names.add(name);
	}

	if (names.size > 1) return 'Varias categorías';
	if (names.size === 1) return [...names][0];
	return items.length > 0 ? SYSTEM_CATEGORY_UNCLASSIFIED : 'Sin categoría';
}
