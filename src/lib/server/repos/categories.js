import { getDb } from '$lib/server/db.js';

/** @typedef {{ _id: import('mongodb').ObjectId, userId: string, name: string, parentId: string|null, categoryKey?: string|null, isFavorite: boolean, isHidden: boolean, isSystem: boolean, isCustom?: boolean, createdAt: Date }} Category */

/**
 * @param {string} userId
 * @returns {Promise<Category[]>}
 */
export async function getCategoriesByUser(userId) {
	const db = await getDb();
	return db.collection('categories').find({ userId }).sort({ isSystem: -1, name: 1 }).toArray();
}

/**
 * Retorna categorías visibles (no ocultas), con las favoritas primero.
 * @param {string} userId
 * @returns {Promise<Category[]>}
 */
export async function getVisibleCategories(userId) {
	const db = await getDb();
	return db
		.collection('categories')
		.find({ userId, isHidden: false })
		.sort({ isFavorite: -1, name: 1 })
		.toArray();
}

/**
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<Category|null>}
 */
export async function getCategoryById(userId, id) {
	const db = await getDb();
	const { ObjectId } = await import('mongodb');
	return db.collection('categories').findOne({ _id: new ObjectId(id), userId });
}

/**
 * @param {string} userId
 * @param {{ name: string, parentId?: string|null, categoryKey?: string|null, isFavorite?: boolean, isHidden?: boolean, isSystem?: boolean, isCustom?: boolean }} data
 * @returns {Promise<import('mongodb').InsertOneResult>}
 */
export async function createCategory(userId, data) {
	const db = await getDb();
	return db.collection('categories').insertOne({
		userId,
		name: data.name,
		parentId: data.parentId || null,
		categoryKey: data.categoryKey ?? null,
		isFavorite: data.isFavorite ?? false,
		isHidden: data.isHidden ?? false,
		isSystem: data.isSystem ?? false,
		isCustom: data.isCustom ?? false,
		createdAt: new Date()
	});
}

/**
 * Categorías personalizadas del usuario (creadas por él).
 * @param {string} userId
 * @returns {Promise<Category[]>}
 */
export async function getCustomCategories(userId) {
	const db = await getDb();
	return db
		.collection('categories')
		.find({ userId, isCustom: true, parentId: null })
		.sort({ name: 1 })
		.toArray();
}

/**
 * @param {string} userId
 * @param {string} id
 * @param {Partial<Pick<Category, 'name' | 'isFavorite' | 'isHidden'>>} updates
 */
export async function updateCategory(userId, id, updates) {
	const db = await getDb();
	const { ObjectId } = await import('mongodb');
	return db
		.collection('categories')
		.updateOne({ _id: new ObjectId(id), userId }, { $set: updates });
}

/**
 * @param {string} userId
 * @param {string} id
 */
export async function deleteCategory(userId, id) {
	const db = await getDb();
	const { ObjectId } = await import('mongodb');
	return db
		.collection('categories')
		.deleteOne({ _id: new ObjectId(id), userId, isSystem: { $ne: true } });
}

/**
 * Asegura el catálogo fijo para un usuario existente (auto-migración idempotente).
 * Se ejecuta sola al entrar a la app: crea las fijas que falten, reasigna
 * movimientos/ítems/memoria/correcciones desde categorías legacy
 * (Comida, Supermercado, Bebidas, Chocolates, Agua, Otros...) a su fija
 * equivalente y elimina las legacy que queden huérfanas.
 * Nunca borra categorías con movimientos ni la de sistema "Sin clasificar".
 * @param {string} userId
 * @returns {Promise<{ created: number, reassigned: number, removed: number }>}
 */
export async function ensureFixedCategories(userId) {
	const {
		FIXED_CATEGORIES,
		SYSTEM_CATEGORY_UNCLASSIFIED,
		SYSTEM_CATEGORY_KEY,
		normalizeCategoryName,
		mapLegacyToFixed
	} = await import('$lib/server/defaults/categories.js');
	const db = await getDb();

	const cats = await db.collection('categories').find({ userId }).toArray();
	const stats = { created: 0, reassigned: 0, removed: 0 };

	// Usuario nuevo: el onboarding (bienvenida) hace el seed completo.
	if (cats.length === 0) return stats;

	const byNorm = new Map(
		cats.filter((c) => !c.isCustom).map((c) => [normalizeCategoryName(c.name), c])
	);
	const byKey = new Map(cats.map((c) => [c.categoryKey || null, c]));

	// 1. Asegurar sistema + 17 fijas (sin duplicar, tolerando acentos/caso).
	// Las fijas nuevas guardan `categoryKey` estable; las existentes se backfillean.
	const fixedDefs = [
		...FIXED_CATEGORIES.map((c) => ({ key: c.key, name: c.name })),
		{ key: SYSTEM_CATEGORY_KEY, name: SYSTEM_CATEGORY_UNCLASSIFIED }
	];
	for (const def of fixedDefs) {
		const existing = byKey.get(def.key) || byNorm.get(normalizeCategoryName(def.name));
		if (!existing) {
			const res = await db.collection('categories').insertOne({
				userId,
				name: def.name,
				categoryKey: def.key,
				parentId: null,
				isFavorite: false,
				isHidden: false,
				isSystem: def.key === SYSTEM_CATEGORY_KEY,
				createdAt: new Date()
			});
			byNorm.set(normalizeCategoryName(def.name), { _id: res.insertedId, name: def.name });
			byKey.set(def.key, { _id: res.insertedId, name: def.name });
			stats.created++;
		} else if (!existing.categoryKey) {
			await db
				.collection('categories')
				.updateOne({ _id: existing._id, userId }, { $set: { categoryKey: def.key } });
			byKey.set(def.key, existing);
		}
	}

	const fixedSet = new Set(FIXED_CATEGORIES.map((c) => normalizeCategoryName(c.name)));
	const systemNorm = normalizeCategoryName(SYSTEM_CATEGORY_UNCLASSIFIED);

	// 2-3. Reasignar legacy -> fija y borrar huérfanas.
	for (const cat of cats) {
		const n = normalizeCategoryName(cat.name);
		if (cat.isSystem || cat.isCustom || n === systemNorm || fixedSet.has(n)) continue;
		const targetName = mapLegacyToFixed(cat.name);
		const target = byNorm.get(normalizeCategoryName(targetName));
		if (!target || target._id.toString() === cat._id.toString()) continue;

		const { ObjectId } = await import('mongodb');
		const targetId = target._id instanceof ObjectId ? target._id : new ObjectId(target._id);
		const legacyId = cat._id instanceof ObjectId ? cat._id : new ObjectId(cat._id);

		const m1 = await db
			.collection('movements')
			.updateMany({ userId, categoryId: legacyId }, { $set: { categoryId: targetId } });
		const m2 = await db
			.collection('movements')
			.updateMany(
				{ userId, 'items.categoryId': legacyId },
				{ $set: { 'items.$[el].categoryId': targetId } },
				{ arrayFilters: [{ 'el.categoryId': legacyId }] }
			);
		const m3 = await db
			.collection('item_corrections')
			.updateMany({ userId, categoryId: legacyId }, { $set: { categoryId: targetId } });
		stats.reassigned += m1.modifiedCount + m2.modifiedCount + m3.modifiedCount;

		const remaining = await db.collection('movements').countDocuments({
			userId,
			$or: [{ categoryId: legacyId }, { 'items.categoryId': legacyId }]
		});
		if (remaining === 0) {
			await db.collection('categories').deleteOne({ _id: legacyId, userId });
			stats.removed++;
		}
	}

	return stats;
}

/**
 * Verifica si una categoría tiene movimientos asociados.
 * @param {string} userId
 * @param {string} categoryId
 * @returns {Promise<boolean>}
 */
export async function categoryHasMovements(userId, categoryId) {
	const db = await getDb();
	const { ObjectId } = await import('mongodb');
	const catId = new ObjectId(categoryId);
	const count = await db.collection('movements').countDocuments({
		userId,
		$or: [{ categoryId: catId }, { 'items.categoryId': catId }]
	});
	return count > 0;
}

/**
 * Siembra las categorías por defecto para un usuario nuevo.
 * @param {string} userId
 */
export async function seedDefaultCategories(userId) {
	const { FIXED_CATEGORIES, SYSTEM_CATEGORY_UNCLASSIFIED, SYSTEM_CATEGORY_KEY } =
		await import('$lib/server/defaults/categories.js');
	const db = await getDb();

	/** @type {any[]} */
	const docs = [];

	// Categoría de sistema
	docs.push({
		userId,
		name: SYSTEM_CATEGORY_UNCLASSIFIED,
		categoryKey: SYSTEM_CATEGORY_KEY,
		parentId: null,
		isFavorite: false,
		isHidden: false,
		isSystem: true,
		createdAt: new Date()
	});

	for (const cat of FIXED_CATEGORIES) {
		docs.push({
			userId,
			name: cat.name,
			categoryKey: cat.key,
			parentId: null,
			isFavorite: false,
			isHidden: false,
			isSystem: false,
			createdAt: new Date()
		});
	}

	await db.collection('categories').insertMany(docs);
}

/**
 * Retorna las categorías hijo de un padre.
 * @param {string} userId
 * @param {string} parentId
 * @returns {Promise<Category[]>}
 */
export async function getChildCategories(userId, parentId) {
	const db = await getDb();
	const { ObjectId } = await import('mongodb');
	return db
		.collection('categories')
		.find({ userId, parentId: new ObjectId(parentId), isHidden: false })
		.sort({ name: 1 })
		.toArray();
}
