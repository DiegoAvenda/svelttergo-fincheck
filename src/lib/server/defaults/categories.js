/**
 * Categorías por defecto para un usuario nuevo.
 * Estructura: { name, children: [{ name }] }
 * La categoría "Sin clasificar" es de sistema y no debe eliminarse.
 */
export const DEFAULT_CATEGORIES = [
	{
		name: 'Comida',
		children: [
			{ name: 'Supermercado' },
			{ name: 'Restaurantes' },
			{ name: 'Comida preparada' },
			{ name: 'Delivery' }
		]
	},
	{
		name: 'Bebidas',
		children: [
			{ name: 'Refrescos' },
			{ name: 'Café' },
			{ name: 'Agua' },
			{ name: 'Otras bebidas' }
		]
	},
	{
		name: 'Snacks y botanas',
		children: [
			{ name: 'Papas' },
			{ name: 'Dulces' },
			{ name: 'Chocolates' },
			{ name: 'Antojos' }
		]
	},
	{
		name: 'Transporte',
		children: [
			{ name: 'Transporte público' },
			{ name: 'Gasolina' },
			{ name: 'Taxis' },
			{ name: 'Viajes en aplicaciones' }
		]
	},
	{ name: 'Hogar', children: [] },
	{ name: 'Cuidado personal', children: [] },
	{ name: 'Salud', children: [] },
	{ name: 'Entretenimiento', children: [] },
	{ name: 'Vivienda', children: [] },
	{ name: 'Otros', children: [] }
];

export const SYSTEM_CATEGORY_UNCLASSIFIED = 'Sin clasificar';
