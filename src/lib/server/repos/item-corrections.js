import { getDb } from '$lib/server/db.js';

/**
 * Aprendizaje por corrección de usuario para ítems de ticket ambiguos.
 * Colección: item_corrections (alias exigido por la tarea: product_mappings).
 *
 * Estructura por documento:
 * {
 *   userId: string,
 *   itemCode: string|null,        // EAN/UPC cuando el ticket lo trae
 *   store: string|null,           // merchant normalizado (ej. "aurrera")
 *   rawDescription: string,       // texto exacto del ticket (ej. "PLC AU DES")
 *   normalizedDescription: string,
 *   correctedDescription: string, // descripción corregida por el usuario
 *   categoryId: ObjectId,
 *   department: string|null,
 *   updatedAt: ISODate,
 *   createdAt: ISODate
 * }
 */

export function normalizeStoreName(store) {
	if (!store || typeof store !== 'string') return null;
	return (
		store
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9\s]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/^(bodega|tienda|super)\s+/, '') || null
	);
}

/**
 * Busca una corrección previa para un ítem ambiguo (o sin categoryId):
 * 1. Por itemCode (código de barras) del usuario.
 * 2. Por combinación store + rawDescription normalizada.
 * @param {string} userId
 * @param {{ itemCode?: string|null, store?: string|null, rawDescription?: string }} item
 * @returns {Promise<{ correctedDescription: string, categoryId: import('mongodb').ObjectId, department?: string|null } | null>}
 */
export async function findItemCorrection(userId, item) {
	const db = await getDb();
	const col = db.collection('item_corrections');
	const itemCode = (item?.itemCode || '').toString().trim() || null;

	if (itemCode) {
		const byCode = await col.findOne({ userId, itemCode });
		if (byCode?.categoryId) return byCode;
	}

	const { normalizeDescription } = await import('$lib/utils/normalize-description.js');
	const normalized = normalizeDescription(item?.rawDescription || '');
	if (!normalized) return null;
	const store = normalizeStoreName(item?.store);

	// 2a. Coincidencia exacta store + descripción normalizada (más específica).
	if (store) {
		const byStoreAndDesc = await col.findOne({ userId, store, normalizedDescription: normalized });
		if (byStoreAndDesc?.categoryId) return byStoreAndDesc;
	}

	// 2b. Fallback: solo descripción normalizada (tiendas sin nombre o tickets viejos).
	const byDesc = await col.findOne({
		userId,
		store: store || null,
		normalizedDescription: normalized
	});
	if (byDesc?.categoryId) return byDesc;
	if (!store) {
		const anyStore = await col.findOne({ userId, normalizedDescription: normalized });
		if (anyStore?.categoryId) return anyStore;
	}

	return null;
}

/**
 * Upsert de corrección (actualiza si existe por itemCode / store+rawDescription, inserta si es nuevo).
 * Guarda categoryId (compat) + categoryKey/subcategoryKey derivados de la subcategoría.
 * @param {string} userId
 * @param {{ itemCode?: string|null, store?: string|null, rawDescription: string, correctedDescription: string, categoryId: import('mongodb').ObjectId|string, subcategoryKey?: string|null, department?: string|null }} data
 */
export async function upsertItemCorrection(userId, data) {
	const db = await getDb();
	const col = db.collection('item_corrections');
	const { normalizeDescription } = await import('$lib/utils/normalize-description.js');
	const { ObjectId } = await import('mongodb');
	const { getSubcategoryByKey, getCategoryKeyOfSubcategory } =
		await import('$lib/server/defaults/subcategories.js');

	const itemCode = (data?.itemCode || '').toString().trim() || null;
	const rawDescription = (data?.rawDescription || '').trim();
	if (!rawDescription) throw new Error('rawDescription es requerido');
	const correctedDescription = (data?.correctedDescription || '').trim() || rawDescription;
	const store = normalizeStoreName(data?.store);
	const normalizedDescription = normalizeDescription(rawDescription);
	const department = (data?.department || '').toString().trim() || null;
	const categoryId =
		data?.categoryId instanceof ObjectId ? data.categoryId : new ObjectId(data.categoryId);
	const subcategoryKey = (data?.subcategoryKey || '').toString().trim() || null;
	if (subcategoryKey) {
		const hit = getSubcategoryByKey(subcategoryKey);
		if (!hit) throw new Error(`subcategoryKey inválida: ${subcategoryKey}`);
	}
	const categoryKey = subcategoryKey ? getCategoryKeyOfSubcategory(subcategoryKey) : null;
	const now = new Date();

	// Filtro de upsert: por itemCode si existe, si no por store + descripción normalizada.
	const filter = itemCode ? { userId, itemCode } : { userId, store, normalizedDescription };

	return col.updateOne(
		filter,
		{
			$set: {
				userId,
				itemCode,
				store,
				rawDescription,
				normalizedDescription,
				correctedDescription,
				categoryId,
				categoryKey,
				subcategoryKey,
				department,
				updatedAt: now
			},
			$setOnInsert: { createdAt: now }
		},
		{ upsert: true }
	);
}
