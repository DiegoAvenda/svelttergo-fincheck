import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { normalizeDescription } from '$lib/utils/normalize-description.js';
import { findClassification } from '$lib/server/repos/classification-memory.js';
import { findItemCorrection } from '$lib/server/repos/item-corrections.js';
import { TICKET_CLASSIFIER_SYSTEM_PROMPT } from './prompts.js';
import { callOpenRouter, extractJson } from '$lib/server/ai/openrouter.js';

const itemClassificationSchema = z.array(
	z.object({
		index: z.number().int().nonnegative(),
		categoryId: z.string().nullable().optional(),
		status: z.enum(['identified', 'ambiguous', 'pending']).default('pending')
	})
);

/**
 * Clasifica los artículos de un ticket:
 * 1. Si la IA de visión ya devolvió categoryId válido, se respeta (alta certeza con departamento).
 * 2. Memoria de clasificación por coincidencia exacta de normalizeDescription.
 * 3. NUEVO: para ítems con status "ambiguous" o categoryId null, busca en item_corrections
 *    (aprendizaje por corrección) por itemCode o por combinación store + rawDescription.
 *    Si existe registro previo, usa categoryId + correctedDescription guardados y marca identified.
 * 4. Los restantes se envían a la IA para asociar a una categoría del usuario.
 * 5. Si la IA falla o no está disponible, se devuelven como "pending"/"ambiguous".
 *
 * @param {string} userId
 * @param {Array<{ itemCode?: string|null, rawDescription?: string, cleanDescription?: string, originalDescription: string, department?: string|null, categoryId?: string|null, amountCents: number, status: 'identified'|'ambiguous'|'pending' }>} items
 * @param {Array<{ _id: import('mongodb').ObjectId, name: string, parentId?: any }>} categories
 * @param {{ store?: string|null }} [options]
 * @returns {Promise<Array<{ itemCode: string|null, rawDescription: string, cleanDescription: string, originalDescription: string, normalizedDescription: string, department: string|null, amountCents: number, categoryId: import('mongodb').ObjectId|null, status: 'identified'|'ambiguous'|'pending' }>>}
 */
export async function classifyItems(userId, items, categories, options = {}) {
	const { ObjectId } = await import('mongodb');

	// Blindaje: aunque la BD del usuario aún tenga categorías legacy (Chocolates,
	// Agua, Otros...), la IA y la UI solo ven el catálogo fijo. Así "chocolates"
	// siempre cae a "Snacks y bebidas" aunque no hayas migrado tu base.
	const { FIXED_CATEGORIES, normalizeCategoryName } = await import(
		'$lib/server/defaults/categories.js'
	);
	const fixedNorms = new Set(FIXED_CATEGORIES.map((c) => normalizeCategoryName(c.name)));
	const categoriesForAi = (categories || []).filter(
		(c) => !c.isSystem && fixedNorms.has(normalizeCategoryName(c.name))
	);
	const effectiveCategories = categoriesForAi.length > 0 ? categoriesForAi : categories;

	// Map de categorías válidas (solo fijas para la IA)
	const validCategoryIds = new Set(effectiveCategories.map((c) => c._id.toString()));
	const store = options?.store ?? null;

	/** @type {Array<{ itemCode: string|null, rawDescription: string, cleanDescription: string, originalDescription: string, normalizedDescription: string, department: string|null, amountCents: number, categoryId: import('mongodb').ObjectId|null, status: 'identified'|'ambiguous'|'pending' }>} */
	const results = [];
	const pendingForAi = [];

	// Paso 1: Revisar memoria de clasificación + correcciones de usuario primero
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const itemCode = (item.itemCode || '').toString().trim() || null;
		const rawDescription = (item.rawDescription || item.originalDescription || '').trim();
		const cleanDescription = (item.cleanDescription || item.originalDescription || rawDescription).trim();
		const displayDescription = cleanDescription || rawDescription;
		const department = (item.department || '').toString().trim() || null;
		const normalized = normalizeDescription(displayDescription);

		const base = {
			itemCode,
			rawDescription,
			cleanDescription,
			originalDescription: displayDescription,
			normalizedDescription: normalized,
			department,
			amountCents: item.amountCents
		};

		// 1a. Si la visión ya identificó categoría válida, respetarla.
		const suggested = (item.categoryId || '').toString().trim();
		if (suggested && validCategoryIds.has(suggested)) {
			results[i] = { ...base, categoryId: new ObjectId(suggested), status: 'identified' };
			continue;
		}

		const remembered = await findClassification(userId, normalized);
		if (
			remembered &&
			remembered.categoryId &&
			validCategoryIds.has(remembered.categoryId.toString())
		) {
			results[i] = {
				...base,
				categoryId: remembered.categoryId,
				status: 'identified'
			};
			continue;
		}

		// 1b. Aprendizaje por corrección: solo para ambiguous o sin categoría.
		const needsCorrectionLookup = item.status === 'ambiguous' || !suggested;
		if (needsCorrectionLookup) {
			try {
				const correction = await findItemCorrection(userId, {
					itemCode,
					store,
					rawDescription
				});
				if (correction?.categoryId && validCategoryIds.has(correction.categoryId.toString())) {
					results[i] = {
						...base,
						// Reemplazar con lo aprendido: descripción corregida + categoría guardada.
						originalDescription: (correction.correctedDescription || '').trim() || displayDescription,
						cleanDescription: (correction.correctedDescription || '').trim() || displayDescription,
						categoryId: correction.categoryId,
						status: 'identified'
					};
					continue;
				}
			} catch (err) {
				console.error('[classifyItems] findItemCorrection error:', err);
			}
		}

		results[i] = {
			...base,
			categoryId: null,
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
	if (pendingForAi.length === 0 || categories.length === 0) {
		return results;
	}

	// Paso 2: Consultar a la IA (OpenRouter free, fallback Anthropic) para los restantes
	const openRouterKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
	const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
	if (!openRouterKey && !anthropicKey) {
		// Degradación elegante: quedan como pendientes
		return results;
	}

	try {
		// El catálogo es FIJO (18 categorías + "Sin clasificar" de sistema).
		// Las subcategorías del ticket (department) son solo contexto de inferencia:
		// la IA debe colapsarlas siempre a una categoría fija, nunca crear otras.
		const systemIds = new Set(
			effectiveCategories.filter((c) => c.isSystem).map((c) => c._id.toString())
		);
		const catalogWithParents = effectiveCategories.map((c) => ({
			id: c._id.toString(),
			name: c.name,
			parentId: c.parentId ? c.parentId.toString() : null,
			isSystem: !!c.isSystem
		}));

		const prompt = `Tienda: ${store || 'desconocida'}

CATÁLOGO FIJO (elige SOLO uno de estos IDs; NUNCA inventes ni cambies categorías; las subcategorías del ticket como LACTEOS/ABARROTES/BEBIDAS son solo contexto para inferir la descripción y elegir la fija correcta; "Sin clasificar" de sistema NO se elige, usa null si nada encaja):
${JSON.stringify(catalogWithParents, null, 2)}

Artículos a clasificar (usa SIEMPRE department + cleanDescription como contexto principal; rawDescription es el texto abreviado original):
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

Devuelve un JSON array con objetos: { "index": number, "categoryId": string | null, "status": "identified" | "ambiguous" | "pending" }. Elige categoría con "identified" siempre que el producto sea reconocible por departamento + descripción; reserva null solo para texto ilegible total.`;

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
					if (results[idx]) {
						if (
							itemClass.categoryId &&
							validCategoryIds.has(itemClass.categoryId) &&
							!systemIds.has(itemClass.categoryId)
						) {
							results[idx].categoryId = new ObjectId(itemClass.categoryId);
							results[idx].status = 'identified';
						} else {
							results[idx].status = itemClass.status || 'ambiguous';
						}
					}
				}
			}
		}

		// Red de seguridad: si la IA dejó null/pending pero el departamento + descripción
		// identifican claramente el producto, asignar por heurística local en vez de
		// mostrar "Sin clasificar (Pendiente)". Ej: LACTEOS + "Producto Lácteo Deslactosado"
		// -> Despensa. Solo aplica cuando hay match fuerte; lo totalmente ilegible
		// sigue quedando pendiente para revisión manual.
		applyDepartmentFallback(results, effectiveCategories);
	} catch (err) {
		console.error('Error al clasificar artículos con IA:', err);
		// Aunque la IA falle, intentar el fallback local por departamento.
		try {
			applyDepartmentFallback(results, effectiveCategories);
		} catch {
			// Los artículos quedan en pending
		}
	}

	return results;
}

/**
 * Fallback local departamento del ticket -> CATEGORÍA FIJA de la app.
 * Solo asigna cuando el producto es reconocible (keywords) y existe la categoría
 * fija en el catálogo del usuario. Nunca elige la categoría de sistema.
 * Las subcategorías del ticket (LACTEOS, ABARROTES, BEBIDAS...) son SOLO contexto
 * para inferir la descripción; siempre colapsan a una de las 18 categorías fijas.
 * @param {Array<any>} results
 * @param {Array<{ _id: import('mongodb').ObjectId, name: string, parentId?: any, isSystem?: boolean }>} categories
 */
function applyDepartmentFallback(results, categories) {
	// Normalizar sin acentos para tolerar "Educación" vs "Educacion", mayúsculas, etc.
	const norm = (s) =>
		(s || '')
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.trim();
	const byName = new Map();
	for (const c of categories) {
		if (c.isSystem) continue;
		byName.set(norm(c.name), c);
	}
	const findByNames = (...names) => {
		for (const n of names) {
			const hit = byName.get(norm(n));
			if (hit) return hit;
		}
		return null;
	};

	const RULES = [
		{
			// Comida para cocinar en casa + limpieza básica del súper.
			departments: ['lacteo', 'lacteos', 'abarrotes basico', 'abarrotes basicos', 'abarrotes procesado', 'abarrotes procesados', 'abarrotes', 'panaderia', 'tortilleria', 'pan', 'fruta', 'frutas', 'verdura', 'verduras', 'frutas y verduras', 'carniceria', 'salchichoneria', 'carne', 'pescaderia', 'cremeria'],
			keywords: ['lech', 'lacteo', 'deslactosad', 'queso', 'yogur', 'yogurt', 'crema', 'mantequilla', 'danonino', 'alpura', 'lala', 'maruchan', 'sopa', 'arroz', 'frijol', 'aceite', 'atun', 'azucar', 'harina', 'pasta', 'galleta', 'cereal', 'avena', 'mayonesa', 'catsup', 'salsa', 'huevo', 'tortilla', 'bolillo', 'telera', 'birote', 'bimbo', 'manzana', 'platano', 'jitomate', 'tomate', 'cebolla', 'papa', 'aguacate', 'naranja', 'lechuga', 'limon', 'fruta', 'verdura', 'carne', 'pollo', 'res', 'cerdo', 'jamon', 'salchicha', 'chorizo', 'pescado'],
			categories: ['despensa']
		},
		{
			// Limpieza básica del súper también va a Despensa (definición del catálogo fijo).
			departments: ['limpieza'],
			keywords: ['detergente', 'cloro', 'suavitel', 'limpiador', 'escoba', 'trapeador', 'pinol', 'fabuloso', 'jabon de', 'lavatrast', 'suavizante'],
			categories: ['despensa']
		},
		{
			// Muebles, herramientas y reparaciones del hogar.
			departments: ['hogar', 'ferreteria', 'mueble', 'herramienta'],
			keywords: ['mueble', 'silla', 'mesa', 'herramienta', 'taladro', 'reparacion', 'foco', 'pintura', 'martillo', 'desarmador'],
			categories: ['hogar']
		},
		{
			// Refrescos, botanas, dulces y café de tienda.
			departments: ['bebida', 'bebidas', 'refresco', 'refrescos', 'agua', 'cafe', 'botana', 'botanas', 'snack', 'dulce', 'dulceria', 'confiteria'],
			keywords: ['coca', 'pepsi', 'jarrito', 'refresco', 'jugo', 'boing', 'red cola', 'mirinda', 'fanta', 'sprite', 'agua', 'bonafont', 'epura', 'ciel', 'cafe', 'nescafe', 'andatti', 'latte', 'americano', 'capuchino', 'sabrita', 'dorito', 'cheeto', 'ruffle', 'cacahuate', 'botana', 'chocolate', 'dulce', 'paleta', 'galleta dulce', 'cerveza'],
			categories: ['snacks y bebidas']
		},
		{
			departments: ['cuidado personal', 'higiene', 'perfumeria', 'ropa', 'belleza', 'cosmetico'],
			keywords: ['shampoo', 'jabon', 'pasta dental', 'desodorante', 'papel higienico', 'toalla', 'ropa', 'camisa', 'pantalon', 'zapatos', 'cosmetico', 'crema corporal', 'rastrillo'],
			categories: ['ropa y cuidado personal']
		},
		{
			departments: ['farmacia', 'salud', 'medicina'],
			keywords: ['paracetamol', 'ibuprofeno', 'vitamina', 'medicamento', 'curita', 'alcohol', 'consulta', 'dentista', 'seguro medico'],
			categories: ['salud']
		},
		{
			// Restaurantes, fondas y delivery.
			departments: ['restaurant', 'fonda', 'cocina', 'delivery', 'comida preparada', 'cafeteria'],
			keywords: ['taco', 'torta', 'fonda', 'restaurant', 'starbucks', 'uber eats', 'rappi', 'didi food', 'delivery', 'propina restaurant', 'hamburguesa', 'pizza'],
			categories: ['restaurantes y delivery']
		},
		{
			departments: ['mascota', 'mascotas', 'veterinaria', 'pet'],
			keywords: ['croqueta', 'arena para gato', 'veterinario', 'mascota', 'perro', 'gato', 'pedigree', 'whiskas'],
			categories: ['mascotas']
		}
	];

	for (const item of results) {
		if (item.categoryId) continue;
		const dept = (item.department || '').toLowerCase().trim();
		const text = `${item.cleanDescription || ''} ${item.rawDescription || ''} ${item.originalDescription || ''}`.toLowerCase();
		if (!dept && !text.trim()) continue;

		for (const rule of RULES) {
			const deptMatch = !dept || rule.departments.some((d) => dept.includes(d));
			// Si hay departamento pero no coincide con la regla, no aplicar esa regla.
			if (item.department && !rule.departments.some((d) => dept.includes(d))) continue;
			const keywordMatch = rule.keywords.some((k) => text.includes(k));
			if ((deptMatch && keywordMatch) || (!item.department && keywordMatch)) {
				const cat = findByNames(...rule.categories);
				if (cat) {
					item.categoryId = cat._id;
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
