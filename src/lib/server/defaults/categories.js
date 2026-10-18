/**
 * Catálogo fijo de la app: fuente única de verdad para categorías de gasto.
 * 17 categorías fijas + "Sin clasificar" de sistema = 18 totales.
 * La IA usa las subcategorías visibles en el ticket SOLO como contexto
 * para inferir mejor la descripción del ítem y elegir la categoría fija
 * correcta, pero NUNCA debe crear ni cambiar estas categorías.
 */

/** @type {Array<{ name: string }>} */
export const FIXED_CATEGORIES = [
	{ name: 'Vivienda' },
	{ name: 'Servicios' },
	{ name: 'Despensa' },
	{ name: 'Restaurantes y delivery' },
	{ name: 'Snacks y bebidas' },
	{ name: 'Transporte' },
	{ name: 'Salud' },
	{ name: 'Educación' },
	{ name: 'Hogar' },
	{ name: 'Ropa y cuidado personal' },
	{ name: 'Entretenimiento y suscripciones' },
	{ name: 'Familia e hijos' },
	{ name: 'Mascotas' },
	{ name: 'Viajes y vacaciones' },
	{ name: 'Deudas' },
	{ name: 'Comisiones e impuestos' },
	{ name: 'Regalos y donativos' }
];

export const SYSTEM_CATEGORY_UNCLASSIFIED = 'Sin clasificar';

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

