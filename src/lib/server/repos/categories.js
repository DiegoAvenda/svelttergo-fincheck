import { getDb } from '$lib/server/db.js';

/** @typedef {{ _id: import('mongodb').ObjectId, userId: string, name: string, parentId: string|null, isFavorite: boolean, isHidden: boolean, isSystem: boolean, createdAt: Date }} Category */

/**
 * @param {string} userId
 * @returns {Promise<Category[]>}
 */
export async function getCategoriesByUser(userId) {
	const db = await getDb();
	return db
		.collection('categories')
		.find({ userId })
		.sort({ isSystem: -1, name: 1 })
		.toArray();
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
 * @param {{ name: string, parentId?: string|null, isFavorite?: boolean, isHidden?: boolean, isSystem?: boolean }} data
 * @returns {Promise<import('mongodb').InsertOneResult>}
 */
export async function createCategory(userId, data) {
	const db = await getDb();
	return db.collection('categories').insertOne({
		userId,
		name: data.name,
		parentId: data.parentId || null,
		isFavorite: data.isFavorite ?? false,
		isHidden: data.isHidden ?? false,
		isSystem: data.isSystem ?? false,
		createdAt: new Date()
	});
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
	return db.collection('categories').deleteOne({ _id: new ObjectId(id), userId, isSystem: { $ne: true } });
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
	const { DEFAULT_CATEGORIES, SYSTEM_CATEGORY_UNCLASSIFIED } = await import(
		'$lib/server/defaults/categories.js'
	);
	const db = await getDb();

	const docs = [];

	// Categoría de sistema
	docs.push({
		userId,
		name: SYSTEM_CATEGORY_UNCLASSIFIED,
		parentId: null,
		isFavorite: false,
		isHidden: false,
		isSystem: true,
		createdAt: new Date()
	});

	for (const cat of DEFAULT_CATEGORIES) {
		const parentDoc = {
			userId,
			name: cat.name,
			parentId: null,
			isFavorite: false,
			isHidden: false,
			isSystem: false,
			createdAt: new Date()
		};
		docs.push(parentDoc);
	}

	// Insertar padres primero
	const result = await db.collection('categories').insertMany(docs);

	// Ahora insertar hijos con sus parentIds
	const childDocs = [];
	let idx = 1; // Empezamos en 1 porque 0 es "Sin clasificar"

	for (const cat of DEFAULT_CATEGORIES) {
		const parentId = result.insertedIds[idx];
		for (const child of cat.children) {
			childDocs.push({
				userId,
				name: child.name,
				parentId,
				isFavorite: false,
				isHidden: false,
				isSystem: false,
				createdAt: new Date()
			});
		}
		idx++;
	}

	if (childDocs.length > 0) {
		await db.collection('categories').insertMany(childDocs);
	}
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
