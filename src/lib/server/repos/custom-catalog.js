import { getDb } from '$lib/server/db.js';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { SUBCATEGORIES } from '$lib/server/defaults/subcategories.js';
import { SYSTEM_CATEGORY_KEY, normalizeCategoryName } from '$lib/server/defaults/categories.js';
import { groupSubcategories, flattenSubcategoryMap } from '$lib/utils/subcategory-catalog.js';

/**
 * @typedef {{ _id: ObjectId, userId: string, categoryId: ObjectId, key: string, name: string, isCustom: boolean, createdAt: Date }} CustomSubcategory
 */

/** Longitud máxima del nombre de una categoría/subcategoría personalizada. */
export const CUSTOM_NAME_MAX_LENGTH = 60;

/**
 * Subcategorías personalizadas del usuario.
 * @param {string} userId
 * @returns {Promise<CustomSubcategory[]>}
 */
export async function getCustomSubcategories(userId) {
	const db = await getDb();
	return db.collection('user_subcategories').find({ userId }).sort({ name: 1 }).toArray();
}

/**
 * Serializa una subcategoría personalizada para el cliente.
 * @param {CustomSubcategory} doc
 */
export function serializeCustomSubcategory(doc) {
	return {
		id: doc._id.toString(),
		key: doc.key,
		name: doc.name,
		categoryId: doc.categoryId.toString(),
		isCustom: true
	};
}

/**
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<ObjectId|null>}
 */
async function getUnclassifiedId(userId) {
	const db = await getDb();
	const doc = await db
		.collection('categories')
		.findOne({ userId, $or: [{ categoryKey: SYSTEM_CATEGORY_KEY }, { isSystem: true }] });
	return doc?._id ?? null;
}

/**
 * Construye el índice de subcategorías (fijas + personalizadas) para un usuario.
 * @param {string} userId
 * @param {Array<{ _id: any, categoryKey?: string|null }>} categories
 * @returns {Promise<{
 *   subs: Array<{ key: string, name: string, categoryId: string, isCustom: boolean, id?: string }>,
 *   byCategoryId: Map<string, Array<{ key: string, name: string, categoryId: string, isCustom: boolean, id?: string }>>,
 *   labelByKey: Map<string, string>,
 *   categoryIdBySubKey: Map<string, string>,
 *   customSubs: Array<{ id: string, key: string, name: string, categoryId: string, isCustom: true }>
 * }>}
 */
export async function buildCatalogForUser(userId, categories) {
	const customDocs = await getCustomSubcategories(userId);
	const cats = (categories || []).map((c) => ({
		id: c._id ? c._id.toString() : c.id,
		categoryKey: c.categoryKey || null
	}));
	const customSubs = customDocs.map(serializeCustomSubcategory);

	const byCategoryId = groupSubcategories(cats, SUBCATEGORIES, customSubs);
	const subs = flattenSubcategoryMap(byCategoryId);

	/** @type {Map<string, string>} */
	const labelByKey = new Map();
	/** @type {Map<string, string>} */
	const categoryIdBySubKey = new Map();
	for (const s of subs) {
		labelByKey.set(s.key, s.name);
		categoryIdBySubKey.set(s.key, s.categoryId);
	}

	return { subs, byCategoryId, labelByKey, categoryIdBySubKey, customSubs };
}

/**
 * Crea una categoría personalizada (real) para el usuario.
 * @param {string} userId
 * @param {string} name
 * @returns {Promise<{ id: string, name: string, categoryKey: string, isCustom: true }>}
 */
export async function createCustomCategory(userId, name) {
	const db = await getDb();
	const clean = (name || '').trim().slice(0, CUSTOM_NAME_MAX_LENGTH);
	if (!clean) throw new Error('El nombre de la categoría es obligatorio');

	const key = `custom-${randomUUID()}`;
	const res = await db.collection('categories').insertOne({
		userId,
		name: clean,
		parentId: null,
		categoryKey: key,
		isFavorite: false,
		isHidden: false,
		isSystem: false,
		isCustom: true,
		createdAt: new Date()
	});

	return { id: res.insertedId.toString(), name: clean, categoryKey: key, isCustom: true };
}

/**
 * Migra líneas legacy del presupuesto (`customKey` sin `categoryId`) a
 * categorías personalizadas reales. Idempotente: reutiliza la categoría si ya
 * existe una con la key derivada. Devuelve `null` si no había nada que migrar.
 * @param {string} userId
 * @param {any[]} lines
 * @returns {Promise<any[]|null>}
 */
export async function migrateLegacyBudgetLines(userId, lines) {
	if (!Array.isArray(lines)) return null;
	if (!lines.some((l) => l.customKey && !l.categoryId)) return null;

	const db = await getDb();
	/** @type {any[]} */
	const migrated = [];
	for (const l of lines) {
		if (l.customKey && !l.categoryId) {
			const legacyKey = String(l.customKey);
			const wantedKey = legacyKey.startsWith('custom-') ? legacyKey : `custom-${legacyKey}`;
			let cat = await db.collection('categories').findOne({ userId, categoryKey: wantedKey });
			if (!cat) {
				const res = await db.collection('categories').insertOne({
					userId,
					name: (l.customName || 'Categoría').slice(0, CUSTOM_NAME_MAX_LENGTH),
					parentId: null,
					categoryKey: wantedKey,
					isFavorite: false,
					isHidden: false,
					isSystem: false,
					isCustom: true,
					createdAt: new Date()
				});
				cat = { _id: res.insertedId };
			}
			migrated.push({
				categoryId: cat._id,
				subcategoryKey: null,
				plannedCents: l.plannedCents || 0
			});
		} else {
			migrated.push(l);
		}
	}
	return migrated;
}

/**
 * Crea una subcategoría personalizada bajo una categoría del usuario.
 * @param {string} userId
 * @param {{ categoryId: string, name: string }} data
 * @returns {Promise<{ id: string, key: string, name: string, categoryId: string, isCustom: true }>}
 */
export async function createCustomSubcategory(userId, data) {
	const db = await getDb();
	const name = (data?.name || '').trim().slice(0, CUSTOM_NAME_MAX_LENGTH);
	if (!name) throw new Error('El nombre de la subcategoría es obligatorio');
	if (!data?.categoryId || !ObjectId.isValid(data.categoryId)) {
		throw new Error('Categoría inválida');
	}
	const cat = await db
		.collection('categories')
		.findOne({ _id: new ObjectId(data.categoryId), userId });
	if (!cat) throw new Error('Categoría no encontrada');

	const normalized = normalizeCategoryName(name);
	const existingCustom = await db
		.collection('user_subcategories')
		.find({ userId, categoryId: cat._id })
		.toArray();
	const staticNames = SUBCATEGORIES.filter((s) => s.categoryKey === cat.categoryKey).map((s) =>
		normalizeCategoryName(s.name)
	);
	if (
		existingCustom.some((s) => normalizeCategoryName(s.name) === normalized) ||
		staticNames.includes(normalized)
	) {
		throw new Error('Ya existe una subcategoría con ese nombre en esta categoría.');
	}

	const key = `custom-${randomUUID()}`;
	const res = await db.collection('user_subcategories').insertOne({
		userId,
		categoryId: cat._id,
		key,
		name,
		isCustom: true,
		createdAt: new Date()
	});

	return {
		id: res.insertedId.toString(),
		key,
		name,
		categoryId: cat._id.toString(),
		isCustom: true
	};
}

/**
 * Borra una subcategoría personalizada. Antes reasigna los movimientos y las
 * correcciones a "sin subcategoría" (conservan la categoría) y limpia las
 * líneas de presupuesto que la usaban.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteCustomSubcategory(userId, id) {
	const db = await getDb();
	if (!ObjectId.isValid(id)) return { removed: false };
	const sub = await db
		.collection('user_subcategories')
		.findOne({ _id: new ObjectId(id), userId, isCustom: true });
	if (!sub) return { removed: false };

	const key = sub.key;
	await db
		.collection('movements')
		.updateMany({ userId, subcategoryKey: key }, { $set: { subcategoryKey: null } });
	await db
		.collection('movements')
		.updateMany(
			{ userId, 'items.subcategoryKey': key },
			{ $set: { 'items.$[el].subcategoryKey': null } },
			{ arrayFilters: [{ 'el.subcategoryKey': key }] }
		);
	await db
		.collection('item_corrections')
		.updateMany({ userId, subcategoryKey: key }, { $set: { subcategoryKey: null } });
	await db
		.collection('budgets')
		.updateMany({ userId }, { $pull: { lines: { subcategoryKey: key } } });

	await db.collection('user_subcategories').deleteOne({ _id: sub._id, userId });
	return { removed: true };
}

/**
 * Borra una categoría personalizada. Reasigna sus movimientos (y los de sus
 * subcategorías) a "Sin clasificar", elimina sus subcategorías personalizadas
 * y limpia las líneas de presupuesto que la usaban.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deleteCustomCategory(userId, id) {
	const db = await getDb();
	if (!ObjectId.isValid(id)) return { removed: false };
	const cat = await db
		.collection('categories')
		.findOne({ _id: new ObjectId(id), userId, isCustom: true });
	if (!cat) return { removed: false };

	const catId = cat._id;
	const unclassifiedId = await getUnclassifiedId(userId);

	await db.collection('movements').updateMany(
		{ userId, categoryId: catId },
		{
			$set: {
				categoryId: unclassifiedId,
				categoryKey: SYSTEM_CATEGORY_KEY,
				subcategoryKey: null
			}
		}
	);
	await db.collection('movements').updateMany(
		{ userId, 'items.categoryId': catId },
		{
			$set: {
				'items.$[el].categoryId': unclassifiedId,
				'items.$[el].subcategoryKey': null
			}
		},
		{ arrayFilters: [{ 'el.categoryId': catId }] }
	);
	await db.collection('item_corrections').updateMany(
		{ userId, categoryId: catId },
		{
			$set: { categoryId: unclassifiedId, categoryKey: SYSTEM_CATEGORY_KEY, subcategoryKey: null }
		}
	);
	await db.collection('user_subcategories').deleteMany({ userId, categoryId: catId });
	await db
		.collection('budgets')
		.updateMany({ userId }, { $pull: { lines: { categoryId: catId } } });

	await db.collection('categories').deleteOne({ _id: catId, userId, isCustom: true });
	return { removed: true };
}

/**
 * Renombra una categoría personalizada. `renamed: false` si no existe o no es
 * personalizada (las del catálogo fijo no se pueden tocar).
 * @param {string} userId
 * @param {string} id
 * @param {string} name
 * @returns {Promise<{ renamed: boolean }>}
 */
export async function renameCustomCategory(userId, id, name) {
	const clean = (name || '').trim().slice(0, CUSTOM_NAME_MAX_LENGTH);
	if (!clean) throw new Error('El nombre es obligatorio');
	if (!ObjectId.isValid(id)) return { renamed: false };

	const db = await getDb();
	const res = await db
		.collection('categories')
		.updateOne({ _id: new ObjectId(id), userId, isCustom: true }, { $set: { name: clean } });
	return { renamed: res.matchedCount > 0 };
}

/**
 * Renombra una subcategoría personalizada. `renamed: false` si no existe.
 * @param {string} userId
 * @param {string} id
 * @param {string} name
 * @returns {Promise<{ renamed: boolean }>}
 */
export async function renameCustomSubcategory(userId, id, name) {
	const clean = (name || '').trim().slice(0, CUSTOM_NAME_MAX_LENGTH);
	if (!clean) throw new Error('El nombre es obligatorio');
	if (!ObjectId.isValid(id)) return { renamed: false };

	const db = await getDb();
	const res = await db
		.collection('user_subcategories')
		.updateOne({ _id: new ObjectId(id), userId, isCustom: true }, { $set: { name: clean } });
	return { renamed: res.matchedCount > 0 };
}
