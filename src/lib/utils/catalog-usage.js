/**
 * Utilidades PURAS para calcular las referencias del catálogo.
 *
 * Una categoría o subcategoría no se puede borrar físicamente si aparece en
 * movimientos, ítems de tickets o líneas de presupuesto (de cualquier mes).
 * La visibilidad (`isHidden`) no interviene: ocultar no elimina referencias.
 */

/**
 * @typedef {{
 *   movementCategoryIds?: any[],
 *   itemCategoryIds?: any[],
 *   movementSubcategoryKeys?: any[],
 *   itemSubcategoryKeys?: any[],
 *   budgetCategoryIds?: any[],
 *   budgetSubcategoryKeys?: any[]
 * }} CatalogReferenceInput
 * @typedef {{
 *   categoryIds: Set<string>,
 *   subcategoryKeys: Set<string>,
 *   budgetCategoryIds: Set<string>,
 *   budgetSubcategoryKeys: Set<string>,
 *   referencedCategoryIds: Set<string>,
 *   referencedSubcategoryKeys: Set<string>
 * }} CatalogUsageSets
 */

/**
 * Construye los conjuntos de referencias separando movimientos de presupuesto
 * y ofreciendo la unión de ambos para decidir si se puede borrar.
 * @param {CatalogReferenceInput} [input]
 * @returns {CatalogUsageSets}
 */
export function buildCatalogUsageSets(input = {}) {
	const addIds = (target, values) => {
		for (const value of values || []) {
			if (value) target.add(value.toString());
		}
	};
	const addKeys = (target, values) => {
		for (const value of values || []) {
			if (value) target.add(String(value));
		}
	};

	/** @type {Set<string>} */
	const categoryIds = new Set();
	/** @type {Set<string>} */
	const subcategoryKeys = new Set();
	/** @type {Set<string>} */
	const budgetCategoryIds = new Set();
	/** @type {Set<string>} */
	const budgetSubcategoryKeys = new Set();

	addIds(categoryIds, input.movementCategoryIds);
	addIds(categoryIds, input.itemCategoryIds);
	addKeys(subcategoryKeys, input.movementSubcategoryKeys);
	addKeys(subcategoryKeys, input.itemSubcategoryKeys);
	addIds(budgetCategoryIds, input.budgetCategoryIds);
	addKeys(budgetSubcategoryKeys, input.budgetSubcategoryKeys);

	/** @type {Set<string>} */
	const referencedCategoryIds = new Set([...categoryIds, ...budgetCategoryIds]);
	/** @type {Set<string>} */
	const referencedSubcategoryKeys = new Set([...subcategoryKeys, ...budgetSubcategoryKeys]);

	return {
		categoryIds,
		subcategoryKeys,
		budgetCategoryIds,
		budgetSubcategoryKeys,
		referencedCategoryIds,
		referencedSubcategoryKeys
	};
}

/**
 * ¿Una categoría (o alguna de sus subcategorías personalizadas) tiene
 * referencias históricas o vigentes?
 * @param {CatalogUsageSets|null|undefined} usage
 * @param {string} categoryId
 * @param {string[]} [subcategoryKeys]
 * @returns {boolean}
 */
export function categoryHasReferences(usage, categoryId, subcategoryKeys = []) {
	if (!usage || !categoryId) return false;
	if (usage.referencedCategoryIds?.has(String(categoryId))) return true;
	return (subcategoryKeys || []).some((key) => usage.referencedSubcategoryKeys?.has(String(key)));
}

/**
 * ¿Una subcategoría tiene referencias históricas o vigentes?
 * @param {CatalogUsageSets|null|undefined} usage
 * @param {string} subcategoryKey
 * @returns {boolean}
 */
export function subcategoryHasReferences(usage, subcategoryKey) {
	return !!usage?.referencedSubcategoryKeys?.has(String(subcategoryKey));
}
