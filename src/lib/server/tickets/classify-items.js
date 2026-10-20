import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { normalizeDescription } from '$lib/utils/normalize-description.js';
import { findItemCorrection } from '$lib/server/repos/item-corrections.js';
import { TICKET_CLASSIFIER_SYSTEM_PROMPT } from './prompts.js';
import { callOpenRouter, extractJson } from '$lib/server/ai/openrouter.js';
import {
	SUBCATEGORIES,
	getCategoryKeyOfSubcategory,
	sanitizeSubcategoryKey,
	suggestSubcategoryKey
} from '$lib/server/defaults/subcategories.js';

const itemClassificationSchema = z.array(
	z.object({
		index: z.number().int().nonnegative(),
		subcategoryKey: z.string().nullable().optional(),
		categoryId: z.string().nullable().optional(),
		status: z.enum(['identified', 'ambiguous', 'pending']).default('pending')
	})
);

/**
 * @typedef {{ itemCode: string|null, rawDescription: string, cleanDescription: string, originalDescription: string, normalizedDescription: string, department: string|null, amountCents: number, categoryId: import('mongodb').ObjectId|null, categoryKey: string|null, subcategoryKey: string|null, status: 'identified'|'ambiguous'|'pending' }} ClassifiedItem
 */

/**
 * Clasifica los artículos de un ticket.
 *
 * Fuente de verdad = catálogo fijo de SUBCATEGORÍAS (`defaults/subcategories.js`).
 * La IA solo puede elegir `subcategoryKey` válidos; la categoría principal SIEMPRE
 * se deriva de la subcategoría en el servidor (nunca se confía al modelo).
 *
 * 1. Si la visión ya devolvió categoryId válido, se respeta (sin subcategoría).
 * 2. Correcciones previas del usuario (item_corrections) por itemCode o
 *    store + rawDescription: se aplican sin llamar a la IA.
 * 3. Los restantes se envían a la IA para elegir una subcategoría del catálogo.
 * 4. Si la IA falla o no está disponible, se intenta una sugerencia local
 *    conservadora; el resto queda pendiente (categoryId null o categoría conocida).
 *
 * @param {string} userId
 * @param {Array<{ itemCode?: string|null, rawDescription?: string, cleanDescription?: string, originalDescription: string, department?: string|null, categoryId?: string|null, subcategoryKey?: string|null, amountCents: number, status: 'identified'|'ambiguous'|'pending' }>} items
 * @param {Array<{ _id: import('mongodb').ObjectId, name: string, categoryKey?: string|null, parentId?: any, isSystem?: boolean }>} categories
 * @param {{ store?: string|null }} [options]
 * @returns {Promise<ClassifiedItem[]>}
 */
export async function classifyItems(userId, items, categories, options = {}) {
	const { ObjectId } = await import('mongodb');

	// Blindaje: aunque la BD del usuario aún tenga categorías legacy (Chocolates,
	// Agua, Otros...), la IA y la UI solo ven el catálogo fijo. Así "chocolates"
	// siempre cae a "Snacks y bebidas" aunque no hayas migrado tu base.
	const { FIXED_CATEGORIES, normalizeCategoryName, buildCategoryIdByKeyMap, categoryKeyOfDoc } =
		await import('$lib/server/defaults/categories.js');
	const fixedNorms = new Set(FIXED_CATEGORIES.map((c) => normalizeCategoryName(c.name)));
	const categoriesForAi = (categories || []).filter(
		(c) => !c.isSystem && fixedNorms.has(normalizeCategoryName(c.name))
	);
	const effectiveCategories = categoriesForAi.length > 0 ? categoriesForAi : categories;

	// Map de categorías válidas (solo fijas para la IA)
	const validCategoryIds = new Set(effectiveCategories.map((c) => c._id.toString()));
	// categoryKey -> _id y _id(string) -> categoryKey (para derivar la categoría).
	const categoryIdByKey = buildCategoryIdByKeyMap(effectiveCategories);
	/** @type {Map<string, string>} */
	const categoryKeyById = new Map();
	for (const c of effectiveCategories) {
		const key = categoryKeyOfDoc(c);
		if (key) categoryKeyById.set(c._id.toString(), key);
	}
	const store = options?.store ?? null;

	/** @type {ClassifiedItem[]} */
	const results = [];
	const pendingForAi = [];

	// Paso 1: revisar la visión y las correcciones previas del usuario.
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const itemCode = (item.itemCode || '').toString().trim() || null;
		const rawDescription = (item.rawDescription || item.originalDescription || '').trim();
		const cleanDescription = (
			item.cleanDescription ||
			item.originalDescription ||
			rawDescription
		).trim();
		const displayDescription = cleanDescription || rawDescription;
		const department = (item.department || '').toString().trim() || null;
		const normalized = normalizeDescription(displayDescription);

		/** @type {ClassifiedItem} */
		const base = {
			itemCode,
			rawDescription,
			cleanDescription,
			originalDescription: displayDescription,
			normalizedDescription: normalized,
			department,
			amountCents: item.amountCents,
			categoryId: null,
			categoryKey: null,
			subcategoryKey: null,
			status: 'pending'
		};

		// 1a. Subcategoría ya sugerida (p. ej. por la visión o el borrador).
		const suggestedSub = sanitizeSubcategoryKey(item.subcategoryKey);
		if (suggestedSub) {
			const catKey = getCategoryKeyOfSubcategory(suggestedSub);
			const catId = catKey ? categoryIdByKey.get(catKey) : null;
			if (catId) {
				results[i] = {
					...base,
					subcategoryKey: suggestedSub,
					categoryKey: catKey,
					categoryId: catId,
					status: 'identified'
				};
				continue;
			}
		}

		// 1b. Si la visión ya identificó categoría válida, respetarla (sin subcategoría).
		const suggested = (item.categoryId || '').toString().trim();
		if (suggested && validCategoryIds.has(suggested)) {
			results[i] = {
				...base,
				categoryId: new ObjectId(suggested),
				categoryKey: categoryKeyById.get(suggested) ?? null,
				status: 'identified'
			};
			continue;
		}

		// 1c. Aprendizaje por corrección: solo para ambiguous o sin categoría.
		// Si el usuario ya aclaró este ítem antes, aplicar sin preguntar ni llamar a la IA.
		const needsCorrectionLookup = item.status === 'ambiguous' || !suggested;
		if (needsCorrectionLookup) {
			try {
				const correction = await findItemCorrection(userId, {
					itemCode,
					store,
					rawDescription
				});
				if (correction) {
					const corrSub = sanitizeSubcategoryKey(correction.subcategoryKey);
					const corrCatKey = corrSub ? getCategoryKeyOfSubcategory(corrSub) : null;
					const corrCatId = corrCatKey ? categoryIdByKey.get(corrCatKey) : null;
					const correctedDesc =
						(correction.correctedDescription || '').trim() || displayDescription;

					if (corrSub && corrCatId) {
						results[i] = {
							...base,
							originalDescription: correctedDesc,
							cleanDescription: correctedDesc,
							subcategoryKey: corrSub,
							categoryKey: corrCatKey,
							categoryId: corrCatId,
							status: 'identified'
						};
						continue;
					}

					if (correction.categoryId && validCategoryIds.has(correction.categoryId.toString())) {
						results[i] = {
							...base,
							originalDescription: correctedDesc,
							cleanDescription: correctedDesc,
							categoryId: correction.categoryId,
							categoryKey: categoryKeyById.get(correction.categoryId.toString()) ?? null,
							status: 'identified'
						};
						continue;
					}
				}
			} catch (err) {
				console.error('[classifyItems] findItemCorrection error:', err);
			}
		}

		results[i] = {
			...base,
			status: item.status || 'pending'
		};
		pendingForAi.push({
			index: i,
			description: displayDescription,
			rawDescription,
			cleanDescription,
			department,
			itemCode,
			normalized
		});
	}

	// Si no hay pendientes de clasificar o no hay categorías, terminamos
	if (pendingForAi.length === 0 || effectiveCategories.length === 0) {
		return results;
	}

	// Paso 2: consultar a la IA (Groq principal -> OpenRouter fallback -> Anthropic)
	const groqKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
	const openRouterKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
	const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
	if (!groqKey && !openRouterKey && !anthropicKey) {
		// Degradación elegante: sugerencia local y lo demás queda pendiente.
		applyFallbacks(results, categoryIdByKey);
		return results;
	}

	try {
		const systemIds = new Set(
			effectiveCategories.filter((c) => c.isSystem).map((c) => c._id.toString())
		);

		// Catálogo permitido: categorías fijas con sus subcategorías (key + nombre).
		const catalogForAi = FIXED_CATEGORIES.filter((c) => categoryIdByKey.has(c.key)).map((c) => ({
			category: c.name,
			subcategories: SUBCATEGORIES.filter((s) => s.categoryKey === c.key).map((s) => ({
				key: s.key,
				name: s.name
			}))
		}));

		const prompt = `Tienda: ${store || 'desconocida'}

CATÁLOGO PERMITIDO (categoría -> subcategorías). Elige SIEMPRE el "key" de una subcategoría de esta lista. NUNCA inventes keys ni categorías. La categoría principal se calcula automáticamente a partir de la subcategoría.
${JSON.stringify(catalogForAi, null, 2)}

Artículos a clasificar (usa SIEMPRE department + cleanDescription como contexto principal; rawDescription es el texto abreviado original; clasifica por la NATURALEZA del artículo, no por la tienda):
${JSON.stringify(
	pendingForAi.map((p) => ({
		index: p.index,
		department: p.department,
		rawDescription: p.rawDescription,
		cleanDescription: p.cleanDescription,
		description: p.description
	})),
	null,
	2
)}

Devuelve un JSON array con objetos: { "index": number, "subcategoryKey": string | null, "status": "identified" | "ambiguous" | "pending" }.
- "subcategoryKey" debe ser un "key" EXACTO del catálogo permitido.
- Ejemplos: "COCA COLA 600 ML" -> "refrescos"; "Papas Sabritas" -> "botanas-saladas"; "Arroz" -> "abarrotes-ingredientes"; "Detergente" -> "productos-limpieza"; "Croquetas para perro" -> "alimento-premios"; "Medicamento veterinario" -> "medicamentos-veterinarios"; café comprado en tienda de conveniencia para consumo inmediato -> "cafe-tienda".
- Si no puedes clasificar con seguridad, devuelve "subcategoryKey": null y status "ambiguous".`;

		let text = '';
		if (openRouterKey) {
			const result = await callOpenRouter({
				system: TICKET_CLASSIFIER_SYSTEM_PROMPT,
				max_tokens: 1024,
				temperature: 0.1,
				messages: [{ role: 'user', content: prompt }]
			});
			text = result.text;
		} else {
			text = await callAnthropicClassifier(anthropicKey, prompt);
		}

		if (text) {
			const raw = extractJson(text);
			const validation = itemClassificationSchema.safeParse(raw);

			if (validation.success) {
				for (const itemClass of validation.data) {
					const idx = itemClass.index;
					if (!results[idx]) continue;

					// Derivar categoría desde la subcategoría validada (fuente de verdad).
					const cleanSub = sanitizeSubcategoryKey(itemClass.subcategoryKey);
					const catKey = cleanSub ? getCategoryKeyOfSubcategory(cleanSub) : null;
					const catId = catKey ? categoryIdByKey.get(catKey) : null;

					if (cleanSub && catId) {
						results[idx].subcategoryKey = cleanSub;
						results[idx].categoryKey = catKey;
						results[idx].categoryId = catId;
						results[idx].status = 'identified';
						continue;
					}

					// Compat: si el modelo devolvió solo categoryId (sin subcategoría).
					if (
						itemClass.categoryId &&
						validCategoryIds.has(itemClass.categoryId) &&
						!systemIds.has(itemClass.categoryId)
					) {
						results[idx].categoryId = new ObjectId(itemClass.categoryId);
						results[idx].categoryKey = categoryKeyById.get(itemClass.categoryId) ?? null;
						results[idx].status = 'identified';
						continue;
					}

					results[idx].status = itemClass.status || 'ambiguous';
				}
			}
		}

		// Red de seguridad local: sugiere subcategoría por keywords cuando la IA
		// dejó el artículo pendiente. Conservadora; lo ilegible sigue pendiente.
		applyFallbacks(results, categoryIdByKey);
	} catch (err) {
		console.error('Error al clasificar artículos con IA:', err);
		try {
			applyFallbacks(results, categoryIdByKey);
		} catch {
			// Los artículos quedan en pending
		}
	}

	return results;
}

/**
 * Respaldo local cuando la IA no clasificó un artículo.
 * 1. Sugerencia de subcategoría por keywords conocidos (refrescos, botanas, etc.).
 * 2. Mapeo departamento del ticket -> categoría fija (sin subcategoría).
 * Nunca inventa subcategorías fuera del catálogo ni elige la categoría de sistema.
 * @param {ClassifiedItem[]} results
 * @param {Map<string, any>} categoryIdByKey
 */
function applyFallbacks(results, categoryIdByKey) {
	for (const item of results) {
		if (item.categoryId || item.subcategoryKey) continue;
		const text =
			`${item.cleanDescription || ''} ${item.rawDescription || ''} ${item.originalDescription || ''}`.trim();

		const subKey = suggestSubcategoryKey(text);
		if (subKey) {
			const catKey = getCategoryKeyOfSubcategory(subKey);
			const catId = catKey ? categoryIdByKey.get(catKey) : null;
			if (catId) {
				item.subcategoryKey = subKey;
				item.categoryKey = catKey;
				item.categoryId = catId;
				item.status = 'identified';
			}
		}
	}

	applyDepartmentFallback(results, categoryIdByKey);
}

/**
 * Fallback local departamento del ticket -> CATEGORÍA FIJA de la app.
 * Solo asigna cuando el producto es reconocible (keywords) y existe la categoría
 * fija en el catálogo del usuario. Nunca elige la categoría de sistema.
 * @param {ClassifiedItem[]} results
 * @param {Map<string, any>} categoryIdByKey
 */
function applyDepartmentFallback(results, categoryIdByKey) {
	const RULES = [
		{
			// Comida para cocinar en casa + limpieza básica del súper.
			departments: [
				'lacteo',
				'lacteos',
				'abarrotes basico',
				'abarrotes basicos',
				'abarrotes procesado',
				'abarrotes procesados',
				'abarrotes',
				'panaderia',
				'tortilleria',
				'pan',
				'fruta',
				'frutas',
				'verdura',
				'verduras',
				'frutas y verduras',
				'carniceria',
				'salchichoneria',
				'carne',
				'pescaderia',
				'cremeria'
			],
			keywords: [
				'lech',
				'lacteo',
				'deslactosad',
				'queso',
				'yogur',
				'yogurt',
				'crema',
				'mantequilla',
				'danonino',
				'alpura',
				'lala',
				'maruchan',
				'sopa',
				'arroz',
				'frijol',
				'aceite',
				'atun',
				'azucar',
				'harina',
				'pasta',
				'galleta',
				'cereal',
				'avena',
				'mayonesa',
				'catsup',
				'salsa',
				'huevo',
				'tortilla',
				'bolillo',
				'telera',
				'birote',
				'bimbo',
				'manzana',
				'platano',
				'jitomate',
				'tomate',
				'cebolla',
				'papa',
				'aguacate',
				'naranja',
				'lechuga',
				'limon',
				'fruta',
				'verdura',
				'carne',
				'pollo',
				'res',
				'cerdo',
				'jamon',
				'salchicha',
				'chorizo',
				'pescado'
			],
			categoryKey: 'despensa'
		},
		{
			// Limpieza básica del súper también va a Despensa (definición del catálogo fijo).
			departments: ['limpieza', 'quimicos'],
			keywords: [
				'detergente',
				'cloro',
				'suavitel',
				'limpiador',
				'escoba',
				'escob',
				'trapeador',
				'pinol',
				'fabuloso',
				'jabon de',
				'lavatrast',
				'suavizante'
			],
			categoryKey: 'despensa'
		},
		{
			departments: ['hogar', 'ferreteria', 'mueble', 'herramienta'],
			keywords: [
				'mueble',
				'silla',
				'mesa',
				'herramienta',
				'taladro',
				'reparacion',
				'foco',
				'pintura',
				'martillo',
				'desarmador'
			],
			categoryKey: 'hogar'
		},
		{
			departments: [
				'bebida',
				'bebidas',
				'refresco',
				'refrescos',
				'agua',
				'cafe',
				'botana',
				'botanas',
				'snack',
				'dulce',
				'dulceria',
				'confiteria'
			],
			keywords: [
				'coca',
				'pepsi',
				'jarrito',
				'refresco',
				'jugo',
				'boing',
				'red cola',
				'mirinda',
				'fanta',
				'sprite',
				'agua',
				'bonafont',
				'epura',
				'ciel',
				'cafe',
				'nescafe',
				'andatti',
				'latte',
				'americano',
				'capuchino',
				'sabrita',
				'dorito',
				'cheeto',
				'ruffle',
				'cacahuate',
				'botana',
				'chocolate',
				'dulce',
				'paleta',
				'galleta dulce',
				'cerveza'
			],
			categoryKey: 'snacks-bebidas'
		},
		{
			departments: ['cuidado personal', 'higiene', 'perfumeria', 'ropa', 'belleza', 'cosmetico'],
			keywords: [
				'shampoo',
				'jabon',
				'pasta dental',
				'desodorante',
				'papel higienico',
				'toalla',
				'ropa',
				'camisa',
				'pantalon',
				'zapatos',
				'cosmetico',
				'crema corporal',
				'rastrillo'
			],
			categoryKey: 'ropa-cuidado-personal'
		},
		{
			departments: ['farmacia', 'salud', 'medicina'],
			keywords: [
				'paracetamol',
				'ibuprofeno',
				'vitamina',
				'medicamento',
				'curita',
				'alcohol',
				'consulta',
				'dentista',
				'seguro medico'
			],
			categoryKey: 'salud'
		},
		{
			departments: ['restaurant', 'fonda', 'cocina', 'delivery', 'comida preparada', 'cafeteria'],
			keywords: [
				'taco',
				'torta',
				'fonda',
				'restaurant',
				'starbucks',
				'uber eats',
				'rappi',
				'didi food',
				'delivery',
				'propina restaurant',
				'hamburguesa',
				'pizza'
			],
			categoryKey: 'restaurantes-delivery'
		},
		{
			departments: ['mascota', 'mascotas', 'veterinaria', 'pet'],
			keywords: [
				'croqueta',
				'arena para gato',
				'veterinario',
				'mascota',
				'perro',
				'gato',
				'pedigree',
				'whiskas'
			],
			categoryKey: 'mascotas'
		}
	];

	for (const item of results) {
		if (item.categoryId || item.subcategoryKey) continue;
		const dept = (item.department || '').toLowerCase().trim();
		const text =
			`${item.cleanDescription || ''} ${item.rawDescription || ''} ${item.originalDescription || ''}`.toLowerCase();
		if (!dept && !text.trim()) continue;

		for (const rule of RULES) {
			if (item.department && !rule.departments.some((d) => dept.includes(d))) continue;
			const keywordMatch = rule.keywords.some((k) => text.includes(k));
			const deptMatch = !item.department || rule.departments.some((d) => dept.includes(d));
			if ((deptMatch && keywordMatch) || (!item.department && keywordMatch)) {
				const catId = categoryIdByKey.get(rule.categoryKey);
				if (catId) {
					item.categoryId = catId;
					item.categoryKey = rule.categoryKey;
					item.status = 'identified';
					break;
				}
			}
		}
	}
}

async function callAnthropicClassifier(apiKey, prompt) {
	const { default: Anthropic } = await import('@anthropic-ai/sdk');
	const model = env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
	const anthropic = new Anthropic({ apiKey });
	const response = await anthropic.messages.create({
		model,
		max_tokens: 1024,
		system: TICKET_CLASSIFIER_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: prompt }]
	});
	const block = response.content.find((b) => b.type === 'text');
	return block?.text || '';
}
