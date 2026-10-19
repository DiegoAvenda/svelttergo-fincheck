/**
 * Catálogo fijo de la app: fuente única de verdad para categorías de gasto.
 * 17 categorías fijas + "Sin clasificar" de sistema = 18 totales.
 *
 * Cada categoría tiene una `key` estable. Las subcategorías viven en
 * `./subcategories.js` y se relacionan con la categoría mediante su `categoryKey`.
 * La IA NUNCA crea ni renombra categorías; a lo sumo elige una subcategoría del
 * catálogo, y de ahí se deriva la categoría principal.
 */

/** @type {Array<{ key: string, name: string }>} */
export const FIXED_CATEGORIES = [
	{ key: 'vivienda', name: 'Vivienda' },
	{ key: 'servicios', name: 'Servicios' },
	{ key: 'despensa', name: 'Despensa' },
	{ key: 'restaurantes-delivery', name: 'Restaurantes y delivery' },
	{ key: 'snacks-bebidas', name: 'Snacks y bebidas' },
	{ key: 'transporte', name: 'Transporte' },
	{ key: 'salud', name: 'Salud' },
	{ key: 'educacion', name: 'Educación' },
	{ key: 'hogar', name: 'Hogar' },
	{ key: 'ropa-cuidado-personal', name: 'Ropa y cuidado personal' },
	{ key: 'entretenimiento-suscripciones', name: 'Entretenimiento y suscripciones' },
	{ key: 'familia-hijos', name: 'Familia e hijos' },
	{ key: 'mascotas', name: 'Mascotas' },
	{ key: 'viajes-vacaciones', name: 'Viajes y vacaciones' },
	{ key: 'deudas', name: 'Deudas' },
	{ key: 'comisiones-impuestos', name: 'Comisiones e impuestos' },
	{ key: 'regalos-donativos', name: 'Regalos y donativos' }
];

export const SYSTEM_CATEGORY_UNCLASSIFIED = 'Sin clasificar';
export const SYSTEM_CATEGORY_KEY = 'sin-clasificar';

/** Mapa key estable -> nombre visible de categoría fija. */
const CATEGORY_NAME_BY_KEY = new Map(FIXED_CATEGORIES.map((c) => [c.key, c.name]));

/**
 * @param {string|null|undefined} key
 * @returns {{ key: string, name: string }|null}
 */
export function getFixedCategoryByKey(key) {
	if (!key || typeof key !== 'string') return null;
	const name = CATEGORY_NAME_BY_KEY.get(key.trim());
	return name ? { key: key.trim(), name } : null;
}

/**
 * Resuelve la `categoryKey` estable a partir del nombre visible (tolera
 * acentos/mayúsculas). Devuelve `SYSTEM_CATEGORY_KEY` para "Sin clasificar".
 * @param {string|null|undefined} name
 * @returns {string|null}
 */
export function getFixedCategoryKeyByName(name) {
	const n = normalizeCategoryName(name);
	if (!n) return null;
	const hit = FIXED_CATEGORIES.find((c) => normalizeCategoryName(c.name) === n);
	if (hit) return hit.key;
	if (n === normalizeCategoryName(SYSTEM_CATEGORY_UNCLASSIFIED)) return SYSTEM_CATEGORY_KEY;
	return null;
}

/**
 * `categoryKey` de un documento de categoría de la BD. Usa el campo estable
 * `categoryKey`; si un registro previo no lo tiene, cae al nombre.
 * @param {{ categoryKey?: string|null, name?: string|null }|null|undefined} cat
 * @returns {string|null}
 */
export function categoryKeyOfDoc(cat) {
	if (!cat) return null;
	if (cat.categoryKey) return cat.categoryKey;
	return getFixedCategoryKeyByName(cat.name);
}

/**
 * Mapa `categoryKey` -> `_id` de categoría del usuario (para derivar la
 * categoría principal desde una subcategoría).
 * @param {Array<{ _id: any, categoryKey?: string|null, name?: string|null }>} categories
 * @returns {Map<string, any>}
 */
export function buildCategoryIdByKeyMap(categories) {
	/** @type {Map<string, any>} */
	const map = new Map();
	for (const c of categories || []) {
		const key = categoryKeyOfDoc(c);
		if (key && !map.has(key)) map.set(key, c._id);
	}
	return map;
}

/**
 * Mapa `_id` (string) -> `categoryKey` de categoría del usuario.
 * @param {Array<{ _id: any, categoryKey?: string|null, name?: string|null }>} categories
 * @returns {Map<string, string>}
 */
export function buildCategoryKeyByIdMap(categories) {
	/** @type {Map<string, string>} */
	const map = new Map();
	for (const c of categories || []) {
		const key = categoryKeyOfDoc(c);
		if (key) map.set(c._id.toString(), key);
	}
	return map;
}

/**
 * @deprecated Usar FIXED_CATEGORIES. Se mantiene por compatibilidad con seed/migración.
 * Estructura: { name, children: [] } (sin hijas en el catálogo fijo).
 */
export const DEFAULT_CATEGORIES = FIXED_CATEGORIES.map((c) => ({ name: c.name, children: [] }));

/** Normaliza para comparar nombres (acentos, mayúsculas). */
export function normalizeCategoryName(name) {
	return (name || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim();
}

/**
 * Mapeo legacy (normalizado) -> categoría fija equivalente.
 * Cubre el catálogo anterior: Comida/Supermercado/Bebidas/Refrescos/Café/Agua/
 * Snacks y botanas/Papas/Dulces/Chocolates/Antojos/Otros y variantes de transporte.
 * Lo no listado cae a "Sin clasificar".
 * @param {string} name
 * @returns {string} nombre de categoría fija
 */
export function mapLegacyToFixed(name) {
	const n = normalizeCategoryName(name);
	const MAP = {
		vivienda: 'Vivienda',
		servicios: 'Servicios',
		despensa: 'Despensa',
		comida: 'Despensa',
		supermercado: 'Despensa',
		'comida preparada': 'Restaurantes y delivery',
		restaurantes: 'Restaurantes y delivery',
		restaurante: 'Restaurantes y delivery',
		delivery: 'Restaurantes y delivery',
		'snacks y bebidas': 'Snacks y bebidas',
		'snacks y botanas': 'Snacks y bebidas',
		bebidas: 'Snacks y bebidas',
		refrescos: 'Snacks y bebidas',
		refresco: 'Snacks y bebidas',
		cafe: 'Snacks y bebidas',
		agua: 'Snacks y bebidas',
		'otras bebidas': 'Snacks y bebidas',
		papas: 'Snacks y bebidas',
		dulces: 'Snacks y bebidas',
		dulce: 'Snacks y bebidas',
		chocolates: 'Snacks y bebidas',
		chocolate: 'Snacks y bebidas',
		antojos: 'Snacks y bebidas',
		antojo: 'Snacks y bebidas',
		transporte: 'Transporte',
		'transporte publico': 'Transporte',
		gasolina: 'Transporte',
		taxis: 'Transporte',
		taxi: 'Transporte',
		'viajes en aplicaciones': 'Transporte',
		salud: 'Salud',
		farmacia: 'Salud',
		educacion: 'Educación',
		hogar: 'Hogar',
		limpieza: 'Despensa',
		'cuidado personal': 'Ropa y cuidado personal',
		'ropa y cuidado personal': 'Ropa y cuidado personal',
		entretenimiento: 'Entretenimiento y suscripciones',
		'entretenimiento y suscripciones': 'Entretenimiento y suscripciones',
		'familia e hijos': 'Familia e hijos',
		familia: 'Familia e hijos',
		mascotas: 'Mascotas',
		mascota: 'Mascotas',
		'viajes y vacaciones': 'Viajes y vacaciones',
		viajes: 'Viajes y vacaciones',
		deudas: 'Deudas',
		deuda: 'Deudas',
		'comisiones e impuestos': 'Comisiones e impuestos',
		comisiones: 'Comisiones e impuestos',
		impuestos: 'Comisiones e impuestos',
		'regalos y donativos': 'Regalos y donativos',
		regalos: 'Regalos y donativos',
		otros: 'Sin clasificar',
		otro: 'Sin clasificar'
	};
	return MAP[n] || 'Sin clasificar';
}

/** @returns {string[]} nombres de las 18 categorías (17 fijas + sistema). */
export function fixedCatalogNames() {
	return [...FIXED_CATEGORIES.map((c) => c.name), SYSTEM_CATEGORY_UNCLASSIFIED];
}
