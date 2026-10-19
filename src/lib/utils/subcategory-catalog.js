/**
 * Utilidades PURAS para combinar el catálogo fijo de subcategorías con las
 * subcategorías personalizadas del usuario.
 *
 * El catálogo fijo (`defaults/subcategories.js`) relaciona cada subcategoría
 * con su categoría principal mediante `categoryKey`. Las personalizadas viven
 * en la colección `user_subcategories` y apuntan directo a un `categoryId`.
 */

/**
 * @typedef {{ id: string, categoryKey?: string|null }} CategoryLike
 * @typedef {{ key: string, name: string, categoryKey?: string|null }} StaticSubcategory
 * @typedef {{ id?: string, key: string, name: string, categoryId: string }} CustomSubcategory
 * @typedef {{ key: string, name: string, categoryId: string, isCustom: boolean, id?: string }} MergedSubcategory
 */

/**
 * Agrupa las subcategorías (fijas + personalizadas) por id de categoría.
 * Solo se incluyen las categorías presentes en `categories`.
 *
 * @param {CategoryLike[]} categories
 * @param {StaticSubcategory[]} staticSubs
 * @param {CustomSubcategory[]} customSubs
 * @returns {Map<string, MergedSubcategory[]>}
 */
export function groupSubcategories(categories, staticSubs, customSubs) {
	/** @type {Map<string, MergedSubcategory[]>} */
	const byCategoryId = new Map();
	/** @type {Map<string, string>} */
	const idByCategoryKey = new Map();

	for (const c of categories || []) {
		byCategoryId.set(c.id, []);
		if (c.categoryKey) idByCategoryKey.set(c.categoryKey, c.id);
	}

	for (const s of staticSubs || []) {
		const categoryId = idByCategoryKey.get(s.categoryKey);
		if (!categoryId) continue;
		byCategoryId.get(categoryId).push({
			key: s.key,
			name: s.name,
			categoryId,
			isCustom: false
		});
	}

	for (const s of customSubs || []) {
		if (!s || !byCategoryId.has(s.categoryId)) continue;
		byCategoryId.get(s.categoryId).push({
			key: s.key,
			name: s.name,
			categoryId: s.categoryId,
			isCustom: true,
			id: s.id
		});
	}

	return byCategoryId;
}

/**
 * Aplana el mapa de subcategorías por categoría en una sola lista.
 * @param {Map<string, MergedSubcategory[]>} byCategoryId
 * @returns {MergedSubcategory[]}
 */
export function flattenSubcategoryMap(byCategoryId) {
	/** @type {MergedSubcategory[]} */
	const out = [];
	for (const list of byCategoryId.values()) out.push(...list);
	return out;
}

/**
 * Mapa `subcategoryKey` -> nombre visible, combinando fijas y personalizadas.
 * @param {StaticSubcategory[]} staticSubs
 * @param {CustomSubcategory[]} customSubs
 * @returns {Map<string, string>}
 */
export function subcategoryLabelMap(staticSubs, customSubs) {
	/** @type {Map<string, string>} */
	const map = new Map();
	for (const s of staticSubs || []) map.set(s.key, s.name);
	for (const s of customSubs || []) map.set(s.key, s.name);
	return map;
}
