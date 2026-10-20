/**
 * Catálogo fijo de SUBCATEGORÍAS (fuente única de verdad).
 *
 * Cada subcategoría tiene:
 *  - `key`: identificador estable usado en la BD (nunca el nombre visible).
 *  - `categoryKey`: la categoría principal a la que pertenece (una sola).
 *  - `name`: etiqueta visible para la interfaz.
 *
 * Las categorías principales viven en `./categories.js` (17 fijas + "Sin clasificar").
 * Este catálogo NO crea categorías nuevas: solo las relaciona. La clave de la
 * categoría (`categoryKey`) enlaza con `FIXED_CATEGORIES[].key`.
 *
 * Reglas:
 *  - La IA solo puede elegir `key`s de esta lista.
 *  - `null`/'' en subcategoría = pendiente de revisión (compatible con históricos).
 */

/** @type {Array<{ categoryKey: string, key: string, name: string }>} */
export const SUBCATEGORIES = [
	// Vivienda
	{ categoryKey: 'vivienda', key: 'renta', name: 'Renta' },
	{ categoryKey: 'vivienda', key: 'hipoteca', name: 'Hipoteca' },
	{
		categoryKey: 'vivienda',
		key: 'mantenimiento-condominio',
		name: 'Mantenimiento y cuotas de condominio'
	},
	{
		categoryKey: 'vivienda',
		key: 'reparaciones-vivienda',
		name: 'Reparaciones e instalaciones de la vivienda'
	},
	{ categoryKey: 'vivienda', key: 'predial', name: 'Impuesto predial' },
	{ categoryKey: 'vivienda', key: 'seguro-vivienda', name: 'Seguro de vivienda' },

	// Servicios
	{ categoryKey: 'servicios', key: 'electricidad', name: 'Electricidad' },
	{ categoryKey: 'servicios', key: 'agua-drenaje', name: 'Agua y drenaje' },
	{ categoryKey: 'servicios', key: 'gas-domestico', name: 'Gas doméstico' },
	{ categoryKey: 'servicios', key: 'internet', name: 'Internet' },
	{ categoryKey: 'servicios', key: 'telefonia-movil', name: 'Telefonía móvil' },
	{ categoryKey: 'servicios', key: 'telefonia-fija', name: 'Telefonía fija' },
	{
		categoryKey: 'servicios',
		key: 'paquetes-servicios-basicos',
		name: 'Paquetes y otros servicios básicos'
	},

	// Despensa
	{ categoryKey: 'despensa', key: 'frutas-verduras', name: 'Frutas y verduras' },
	{ categoryKey: 'despensa', key: 'carnes-aves-pescados', name: 'Carnes, aves y pescados' },
	{ categoryKey: 'despensa', key: 'lacteos-huevos', name: 'Lácteos y huevos' },
	{ categoryKey: 'despensa', key: 'pan-tortillas-harinas', name: 'Pan, tortillas y harinas' },
	{
		categoryKey: 'despensa',
		key: 'abarrotes-ingredientes',
		name: 'Abarrotes e ingredientes para cocinar'
	},
	{
		categoryKey: 'despensa',
		key: 'conservas-congelados',
		name: 'Conservas, congelados y comida preparada para casa'
	},
	{ categoryKey: 'despensa', key: 'cafe-te-casa', name: 'Café y té para preparar en casa' },
	{ categoryKey: 'despensa', key: 'productos-limpieza', name: 'Productos de limpieza' },

	// Restaurantes y delivery
	{ categoryKey: 'restaurantes-delivery', key: 'delivery', name: 'Delivery' },
	{
		categoryKey: 'restaurantes-delivery',
		key: 'restaurantes-presenciales',
		name: 'Restaurantes presenciales'
	},
	{
		categoryKey: 'restaurantes-delivery',
		key: 'comida-rapida-llevar',
		name: 'Comida rápida y para llevar'
	},
	{ categoryKey: 'restaurantes-delivery', key: 'cafeterias', name: 'Cafeterías' },

	// Snacks y bebidas
	{ categoryKey: 'snacks-bebidas', key: 'refrescos', name: 'Refrescos' },
	{ categoryKey: 'snacks-bebidas', key: 'botanas-saladas', name: 'Botanas saladas' },
	{ categoryKey: 'snacks-bebidas', key: 'dulces-chocolates', name: 'Dulces y chocolates' },
	{ categoryKey: 'snacks-bebidas', key: 'cafe-tienda', name: 'Café de tienda' },
	{
		categoryKey: 'snacks-bebidas',
		key: 'bebidas-preparadas',
		name: 'Bebidas preparadas individuales'
	},
	{
		categoryKey: 'snacks-bebidas',
		key: 'otras-bebidas-envasadas',
		name: 'Otras bebidas envasadas'
	},

	// Transporte
	{ categoryKey: 'transporte', key: 'gasolina-diesel', name: 'Gasolina y diésel' },
	{
		categoryKey: 'transporte',
		key: 'apps-transporte-taxis',
		name: 'Apps de transporte y taxis'
	},
	{ categoryKey: 'transporte', key: 'transporte-publico', name: 'Transporte público' },
	{ categoryKey: 'transporte', key: 'casetas', name: 'Casetas' },
	{ categoryKey: 'transporte', key: 'estacionamiento', name: 'Estacionamiento' },
	{
		categoryKey: 'transporte',
		key: 'mantenimiento-vehiculo',
		name: 'Mantenimiento y reparación del vehículo'
	},
	{
		categoryKey: 'transporte',
		key: 'seguro-tramites-vehiculares',
		name: 'Seguro y trámites vehiculares'
	},
	{ categoryKey: 'transporte', key: 'lavado-vehiculo', name: 'Lavado y cuidado del vehículo' },

	// Salud
	{ categoryKey: 'salud', key: 'consultas-medicas', name: 'Consultas médicas' },
	{
		categoryKey: 'salud',
		key: 'medicamentos-tratamientos',
		name: 'Medicamentos y tratamientos'
	},
	{ categoryKey: 'salud', key: 'dentista-ortodoncia', name: 'Dentista y ortodoncia' },
	{ categoryKey: 'salud', key: 'estudios-analisis', name: 'Estudios y análisis clínicos' },
	{ categoryKey: 'salud', key: 'hospitales-urgencias', name: 'Hospitales y urgencias' },
	{ categoryKey: 'salud', key: 'terapia-rehabilitacion', name: 'Terapia y rehabilitación' },
	{ categoryKey: 'salud', key: 'seguro-medico', name: 'Seguro médico' },
	{ categoryKey: 'salud', key: 'optica-salud-visual', name: 'Óptica y salud visual' },

	// Educación
	{
		categoryKey: 'educacion',
		key: 'colegiaturas-inscripciones',
		name: 'Colegiaturas e inscripciones'
	},
	{ categoryKey: 'educacion', key: 'cursos-certificaciones', name: 'Cursos y certificaciones' },
	{ categoryKey: 'educacion', key: 'libros-materiales', name: 'Libros y materiales educativos' },
	{ categoryKey: 'educacion', key: 'utiles-escolares', name: 'Útiles escolares' },
	{
		categoryKey: 'educacion',
		key: 'tutorias-particulares',
		name: 'Tutorías y clases particulares'
	},
	{ categoryKey: 'educacion', key: 'examenes-tramites', name: 'Exámenes y trámites académicos' },

	// Hogar
	{ categoryKey: 'hogar', key: 'muebles', name: 'Muebles' },
	{
		categoryKey: 'hogar',
		key: 'electrodomesticos-hogar',
		name: 'Electrodomésticos y electrónicos del hogar'
	},
	{ categoryKey: 'hogar', key: 'utensilios-cocina', name: 'Utensilios de cocina' },
	{ categoryKey: 'hogar', key: 'herramientas', name: 'Herramientas' },
	{ categoryKey: 'hogar', key: 'decoracion-textiles', name: 'Decoración y textiles' },
	{
		categoryKey: 'hogar',
		key: 'organizacion-almacenamiento',
		name: 'Organización y almacenamiento'
	},
	{ categoryKey: 'hogar', key: 'jardineria', name: 'Jardinería' },

	// Ropa y cuidado personal
	{ categoryKey: 'ropa-cuidado-personal', key: 'ropa', name: 'Ropa' },
	{ categoryKey: 'ropa-cuidado-personal', key: 'calzado', name: 'Calzado' },
	{ categoryKey: 'ropa-cuidado-personal', key: 'accesorios', name: 'Accesorios' },
	{ categoryKey: 'ropa-cuidado-personal', key: 'higiene-personal', name: 'Higiene personal' },
	{
		categoryKey: 'ropa-cuidado-personal',
		key: 'cosmeticos-cuidado',
		name: 'Cosméticos y cuidado de piel y cabello'
	},
	{
		categoryKey: 'ropa-cuidado-personal',
		key: 'peluqueria-estetica',
		name: 'Peluquería, barbería y estética'
	},
	{
		categoryKey: 'ropa-cuidado-personal',
		key: 'lavanderia-tintoreria',
		name: 'Lavandería y tintorería'
	},

	// Entretenimiento y suscripciones
	{
		categoryKey: 'entretenimiento-suscripciones',
		key: 'streaming-video',
		name: 'Streaming de video'
	},
	{
		categoryKey: 'entretenimiento-suscripciones',
		key: 'musica-audio',
		name: 'Música y audio digital'
	},
	{
		categoryKey: 'entretenimiento-suscripciones',
		key: 'software-suscripciones',
		name: 'Software y suscripciones digitales'
	},
	{ categoryKey: 'entretenimiento-suscripciones', key: 'videojuegos', name: 'Videojuegos' },
	{
		categoryKey: 'entretenimiento-suscripciones',
		key: 'cine-espectaculos',
		name: 'Cine, conciertos y espectáculos'
	},
	{
		categoryKey: 'entretenimiento-suscripciones',
		key: 'hobbies-recreativas',
		name: 'Hobbies y actividades recreativas'
	},
	{
		categoryKey: 'entretenimiento-suscripciones',
		key: 'gimnasio-deporte',
		name: 'Gimnasio y actividades deportivas'
	},

	// Familia e hijos
	{
		categoryKey: 'familia-hijos',
		key: 'guarderia-cuidado-infantil',
		name: 'Guardería y cuidado infantil'
	},
	{
		categoryKey: 'familia-hijos',
		key: 'panales-alimentacion-infantil',
		name: 'Pañales y alimentación infantil'
	},
	{
		categoryKey: 'familia-hijos',
		key: 'juguetes-infantiles',
		name: 'Juguetes y artículos infantiles'
	},
	{
		categoryKey: 'familia-hijos',
		key: 'actividades-infantiles',
		name: 'Actividades y entretenimiento infantil'
	},
	{ categoryKey: 'familia-hijos', key: 'apoyo-familiares', name: 'Apoyo económico a familiares' },

	// Mascotas
	{ categoryKey: 'mascotas', key: 'alimento-premios', name: 'Alimento y premios' },
	{ categoryKey: 'mascotas', key: 'consultas-veterinarias', name: 'Consultas veterinarias' },
	{
		categoryKey: 'mascotas',
		key: 'medicamentos-veterinarios',
		name: 'Medicamentos y tratamientos veterinarios'
	},
	{ categoryKey: 'mascotas', key: 'higiene-arena', name: 'Higiene y arena sanitaria' },
	{ categoryKey: 'mascotas', key: 'bano-estetica-mascota', name: 'Baño y estética' },
	{ categoryKey: 'mascotas', key: 'accesorios-juguetes-mascota', name: 'Accesorios y juguetes' },
	{ categoryKey: 'mascotas', key: 'guarderia-pension-mascota', name: 'Guardería y pensión' },

	// Viajes y vacaciones
	{
		categoryKey: 'viajes-vacaciones',
		key: 'vuelos-buses-trenes',
		name: 'Vuelos, autobuses y trenes'
	},
	{ categoryKey: 'viajes-vacaciones', key: 'hospedaje', name: 'Hospedaje' },
	{
		categoryKey: 'viajes-vacaciones',
		key: 'transporte-local-renta',
		name: 'Transporte local y alquiler de vehículos'
	},
	{ categoryKey: 'viajes-vacaciones', key: 'comidas-viaje', name: 'Comidas durante el viaje' },
	{
		categoryKey: 'viajes-vacaciones',
		key: 'actividades-excursiones',
		name: 'Actividades y excursiones'
	},
	{
		categoryKey: 'viajes-vacaciones',
		key: 'seguro-documentacion-viaje',
		name: 'Seguro y documentación de viaje'
	},
	{
		categoryKey: 'viajes-vacaciones',
		key: 'equipaje-cargos',
		name: 'Equipaje y cargos adicionales'
	},

	// Deudas
	{ categoryKey: 'deudas', key: 'pago-capital', name: 'Pago de capital de préstamos' },
	{ categoryKey: 'deudas', key: 'intereses', name: 'Intereses' },
	{ categoryKey: 'deudas', key: 'recargos-mora', name: 'Recargos por mora' },
	{
		categoryKey: 'deudas',
		key: 'otros-cargos-deuda',
		name: 'Otros cargos relacionados con deudas'
	},
	{ categoryKey: 'deudas', key: 'pago-tarjetas', name: 'Pago de tarjetas de crédito' },

	// Comisiones e impuestos
	{
		categoryKey: 'comisiones-impuestos',
		key: 'comisiones-bancarias',
		name: 'Comisiones bancarias'
	},
	{
		categoryKey: 'comisiones-impuestos',
		key: 'anualidades-tarjetas',
		name: 'Anualidades y cargos de tarjetas'
	},
	{
		categoryKey: 'comisiones-impuestos',
		key: 'comisiones-financieras',
		name: 'Comisiones por servicios financieros'
	},
	{
		categoryKey: 'comisiones-impuestos',
		key: 'impuestos-personales',
		name: 'Impuestos personales'
	},
	{ categoryKey: 'comisiones-impuestos', key: 'multas-recargos', name: 'Multas y recargos' },
	{
		categoryKey: 'comisiones-impuestos',
		key: 'tramites-derechos',
		name: 'Trámites y derechos gubernamentales'
	},

	// Regalos y donativos
	{ categoryKey: 'regalos-donativos', key: 'regalos', name: 'Regalos' },
	{
		categoryKey: 'regalos-donativos',
		key: 'donativos',
		name: 'Donativos a organizaciones y causas'
	},
	{
		categoryKey: 'regalos-donativos',
		key: 'cooperaciones-eventos',
		name: 'Cooperaciones y aportaciones para eventos'
	}
];

/**
 * Subcategoría de sistema para "Sin clasificar". No se ofrece a la IA: el
 * clasificador devuelve `null` y el backend lo interpreta como pendiente.
 */
export const SYSTEM_SUBCATEGORY_PENDING_KEY = 'pendiente-revision';

/** @type {Map<string, { categoryKey: string, key: string, name: string }>} */
const BY_KEY = new Map(SUBCATEGORIES.map((s) => [s.key, s]));

/** @param {string|null|undefined} key */
export function getSubcategoryByKey(key) {
	if (!key || typeof key !== 'string') return null;
	return BY_KEY.get(key.trim()) || null;
}

/** @param {string|null|undefined} key */
export function isValidSubcategoryKey(key) {
	return typeof key === 'string' && BY_KEY.has(key.trim());
}

/** Etiqueta visible de una subcategoría; `null`/inválida = pendiente. */
export function subcategoryLabel(key) {
	const hit = getSubcategoryByKey(key);
	return hit ? hit.name : 'Pendiente de revisión';
}

/**
 * Subcategorías de una categoría fija (por `categoryKey`).
 * @param {string} categoryKey
 */
export function getSubcategoriesOf(categoryKey) {
	if (!categoryKey) return [];
	return SUBCATEGORIES.filter((s) => s.categoryKey === categoryKey);
}

/**
 * Deriva la categoría principal (`categoryKey`) desde una subcategoría.
 * Evita contradicciones de la IA: la categoría se calcula, no se confía al modelo.
 * @param {string|null|undefined} subcategoryKey
 * @returns {string|null}
 */
export function getCategoryKeyOfSubcategory(subcategoryKey) {
	const hit = getSubcategoryByKey(subcategoryKey);
	return hit ? hit.categoryKey : null;
}

/**
 * Normaliza la salida de la IA/UI a una key válida del catálogo.
 * Devuelve `null` para keys inválidas (nunca inventa subcategorías).
 * @param {string|null|undefined} key
 * @returns {string|null}
 */
export function sanitizeSubcategoryKey(key) {
	const hit = getSubcategoryByKey(key);
	if (!hit) return null;
	// "Pendiente de revisión" equivale a sin subcategoría.
	if (hit.key === SYSTEM_SUBCATEGORY_PENDING_KEY) return null;
	return hit.key;
}

/**
 * Valida compatibilidad categoría principal <-> subcategoría.
 * `null`/'' en subcategoría = pendiente de revisión (válido para históricos y ambiguos).
 * @param {string|null|undefined} categoryKey key de categoría fija (o 'sin-clasificar')
 * @param {string|null|undefined} subcategoryKey
 */
export function isCompatibleCategorySubcategory(categoryKey, subcategoryKey) {
	const cleanSub = sanitizeSubcategoryKey(subcategoryKey);
	if (cleanSub === null) return true; // pendiente siempre es compatible
	const hit = getSubcategoryByKey(cleanSub);
	if (!hit) return false;
	if (!categoryKey) return true;
	return hit.categoryKey === categoryKey;
}

/** @returns {string[]} keys válidas (incluye solo las asignables, no la pendiente). */
export function allSubcategoryKeys() {
	return [...BY_KEY.keys()].filter((k) => k !== SYSTEM_SUBCATEGORY_PENDING_KEY);
}

/**
 * Sugerencia local de subcategoría por palabras clave (solo respaldo cuando la
 * IA no está disponible). Muy conservadora: solo productos inequívocos.
 * La clasificación principal la hace la IA; esto evita dejar en "pendiente"
 * casos obvios como refrescos o botanas.
 * @param {string} text
 * @returns {string|null}
 */
export function suggestSubcategoryKey(text) {
	if (!text) return null;
	const t = text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
	const has = (...words) => words.some((w) => t.includes(w));

	// Snacks y bebidas
	if (
		has(
			'coca cola',
			'coca-cola',
			'cocacola',
			'pepsi',
			'jarrito',
			'refresco',
			'mirinda',
			'fanta',
			'sprite',
			'red cola',
			'seven up',
			'7up',
			'squirt',
			'manzanita'
		)
	)
		return 'refrescos';
	if (has('sabrita', 'dorito', 'cheeto', 'ruffle', 'tostito', 'chicharron', 'cacahuate', 'botana'))
		return 'botanas-saladas';
	if (has('chocolate', 'paleta', 'gomita', 'skittles', 'snickers', 'oreo', 'gansito', 'panditas'))
		return 'dulces-chocolates';

	// Despensa
	if (
		has(
			'detergente',
			'cloro',
			'suavitel',
			'limpiador',
			'fabuloso',
			'pinol',
			'escoba',
			'escob',
			'trapeador',
			'lavatrastes',
			'suavizante'
		)
	)
		return 'productos-limpieza';
	if (has('leche', 'queso', 'yogur', 'yogurt', 'crema', 'mantequilla', 'huevo', 'danonino'))
		return 'lacteos-huevos';
	if (
		has('carne', 'pollo', 'jamon', 'salchicha', 'chorizo', 'pescado', 'bistec', 'molida', 'chuleta')
	)
		return 'carnes-aves-pescados';
	if (
		has(
			'manzana',
			'platano',
			'jitomate',
			'tomate',
			'cebolla',
			'aguacate',
			'naranja',
			'lechuga',
			'limon',
			'zanahoria',
			'verdura'
		)
	)
		return 'frutas-verduras';
	if (has('tortilla', 'bolillo', 'telera', 'bimbo', 'pan blanco', 'pan integral'))
		return 'pan-tortillas-harinas';
	if (
		has(
			'arroz',
			'frijol',
			'aceite',
			'harina',
			'pasta',
			'atun',
			'azucar',
			'sal ',
			'mayonesa',
			'catsup',
			'salsa',
			'lenteja',
			'garbanzo',
			'cereal',
			'avena'
		)
	)
		return 'abarrotes-ingredientes';

	// Mascotas
	if (
		has(
			'croqueta',
			'pedigree',
			'whiskas',
			'dog chow',
			'cat chow',
			'alimento para perro',
			'alimento para gato'
		)
	)
		return 'alimento-premios';
	// Medicamento veterinario ANTES que la regla genérica de veterinaria.
	if (
		has(
			'medicamento veterinario',
			'medicamento para perro',
			'medicamento para gato',
			'desparasitante',
			'antipulgas'
		)
	)
		return 'medicamentos-veterinarios';
	if (has('veterinari')) return 'consultas-veterinarias';

	// Transporte
	if (has('gasolina', 'diesel', 'magna', 'premium', 'pemex')) return 'gasolina-diesel';
	if (has('uber', 'didi', 'taxi')) return 'apps-transporte-taxis';
	if (has('estacionamiento', 'parking')) return 'estacionamiento';
	if (has('caseta', 'peaje')) return 'casetas';
	if (has('metro', 'metrobus', 'pasaje', 'camion')) return 'transporte-publico';

	// Salud
	if (has('paracetamol', 'ibuprofeno', 'vitamina', 'medicamento', 'pastilla', 'farmacia'))
		return 'medicamentos-tratamientos';
	if (has('consulta medica', 'consultorio', 'doctor')) return 'consultas-medicas';
	if (has('dentista', 'ortodoncia')) return 'dentista-ortodoncia';

	// Suscripciones / entretenimiento
	if (has('netflix', 'disney', 'hbo', 'prime video', 'paramount')) return 'streaming-video';
	if (has('spotify', 'apple music', 'deezer')) return 'musica-audio';
	if (has('steam', 'playstation', 'xbox', 'nintendo', 'videojuego')) return 'videojuegos';

	return null;
}
