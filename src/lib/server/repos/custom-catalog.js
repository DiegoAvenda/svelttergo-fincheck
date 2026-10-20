import { getDb } from '$lib/server/db.js';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { SUBCATEGORIES } from '$lib/server/defaults/subcategories.js';
import { SYSTEM_CATEGORY_KEY, normalizeCategoryName } from '$lib/server/defaults/categories.js';
import { groupSubcategories, flattenSubcategoryMap } from '$lib/utils/subcategory-catalog.js';
import {
	buildCatalogUsageSets,
	categoryHasReferences,
	subcategoryHasReferences
} from '$lib/utils/catalog-usage.js';

/**
 * @typedef {{ _id: ObjectId, userId: string, categoryId: ObjectId, key: string, name: string, isCustom: boolean, isHidden?: boolean, createdAt: Date }} CustomSubcategory
 */

/** Longitud máxima del nombre de una categoría/subcategoría personalizada. */
export const CUSTOM_NAME_MAX_LENGTH = 60;

/**
 * Subcategorías personalizadas del usuario.
 * @param {string} userId
 * @param {{ includeHidden?: boolean }} [options]
 * @returns {Promise<CustomSubcategory[]>}
 */
export async function getCustomSubcategories(userId, options = {}) {
	const { includeHidden = true } = options;
	const db = await getDb();
	/** @type {any} */
	const filter = { userId };
	if (!includeHidden) filter.isHidden = { $ne: true };
	return db.collection('user_subcategories').find(filter).sort({ name: 1 }).toArray();
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
		isCustom: true,
		isHidden: !!doc.isHidden
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
 * Por defecto excluye las categorías/subcategorías ocultas (para selectores de
 * captura). Con `includeHidden: true` las incluye (para historial y Ajustes).
 * @param {string} userId
 * @param {Array<{ _id: any, categoryKey?: string|null, isHidden?: boolean }>} categories
 * @param {{ includeHidden?: boolean }} [options]
 * @returns {Promise<{
 *   subs: Array<{ key: string, name: string, categoryId: string, isCustom: boolean, isHidden: boolean, id?: string }>,
 *   byCategoryId: Map<string, Array<{ key: string, name: string, categoryId: string, isCustom: boolean, isHidden: boolean, id?: string }>>,
 *   labelByKey: Map<string, string>,
 *   categoryIdBySubKey: Map<string, string>,
 *   customSubs: Array<{ id: string, key: string, name: string, categoryId: string, isCustom: true, isHidden: boolean }>
 * }>}
 */
export async function buildCatalogForUser(userId, categories, options = {}) {
	const { includeHidden = false } = options;
	const customDocs = await getCustomSubcategories(userId, { includeHidden });
	const source = includeHidden ? categories || [] : (categories || []).filter((c) => !c.isHidden);
	const cats = source.map((c) => ({
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
 * Referencias del catálogo: ids de categoría y keys de subcategoría que
 * aparecen en movimientos (incluidos ítems de tickets) **y en líneas de
 * presupuesto de cualquier mes**. La unión (`referenced*`) es la que autoriza
 * o bloquea un borrado definitivo. `isHidden` no interviene.
 * @param {string} userId
 * @returns {Promise<{
 *   categoryIds: Set<string>,
 *   subcategoryKeys: Set<string>,
 *   budgetCategoryIds: Set<string>,
 *   budgetSubcategoryKeys: Set<string>,
 *   referencedCategoryIds: Set<string>,
 *   referencedSubcategoryKeys: Set<string>
 * }>}
 */
export async function getCatalogUsage(userId) {
	const db = await getDb();
	const movements = db.collection('movements');
	const budgets = db.collection('budgets');

	const [directCats, itemCats, directSubs, itemSubs, budgetCats, budgetSubs] = await Promise.all([
		movements.distinct('categoryId', { userId }),
		movements.distinct('items.categoryId', { userId }),
		movements.distinct('subcategoryKey', { userId }),
		movements.distinct('items.subcategoryKey', { userId }),
		budgets.distinct('lines.categoryId', { userId }),
		budgets.distinct('lines.subcategoryKey', { userId })
	]);

	return buildCatalogUsageSets({
		movementCategoryIds: directCats,
		itemCategoryIds: itemCats,
		movementSubcategoryKeys: directSubs,
		itemSubcategoryKeys: itemSubs,
		budgetCategoryIds: budgetCats,
		budgetSubcategoryKeys: budgetSubs
	});
}

/**
 * Oculta o muestra una categoría (fija o personalizada). Solo cambia la
 * visibilidad del catálogo: **no toca movimientos ni líneas de presupuesto**.
 * Las líneas históricas y las del mes activo conservan sus importes y se
 * siguen mostrando en el presupuesto.
 * @param {string} userId
 * @param {string} id
 * @param {boolean} hidden
 * @returns {Promise<{ updated: boolean }>}
 */
export async function setCategoryHidden(userId, id, hidden) {
	if (!ObjectId.isValid(id)) return { updated: false };
	const db = await getDb();
	const catId = new ObjectId(id);
	const res = await db
		.collection('categories')
		.updateOne({ _id: catId, userId, isSystem: { $ne: true } }, { $set: { isHidden: !!hidden } });

	return { updated: res.matchedCount > 0 };
}

/**
 * Oculta o muestra una subcategoría personalizada. Solo cambia la visibilidad
 * del catálogo; no elimina líneas de presupuesto ni movimientos.
 * @param {string} userId
 * @param {string} id
 * @param {boolean} hidden
 * @returns {Promise<{ updated: boolean }>}
 */
export async function setCustomSubcategoryHidden(userId, id, hidden) {
	if (!ObjectId.isValid(id)) return { updated: false };
	const db = await getDb();
	const sub = await db
		.collection('user_subcategories')
		.findOne({ _id: new ObjectId(id), userId, isCustom: true });
	if (!sub) return { updated: false };

	await db
		.collection('user_subcategories')
		.updateOne({ _id: sub._id, userId }, { $set: { isHidden: !!hidden } });

	return { updated: true };
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
		isHidden: false,
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
 * Borra una subcategoría personalizada. Solo se permite si **no tiene ninguna
 * referencia**: movimientos, ítems de tickets ni líneas de presupuesto de
 * cualquier mes. La comprobación se repite aquí en el servidor.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ removed: boolean, blocked?: boolean }>}
 */
export async function deleteCustomSubcategory(userId, id) {
	const db = await getDb();
	if (!ObjectId.isValid(id)) return { removed: false };
	const sub = await db
		.collection('user_subcategories')
		.findOne({ _id: new ObjectId(id), userId, isCustom: true });
	if (!sub) return { removed: false };

	const usage = await getCatalogUsage(userId);
	if (subcategoryHasReferences(usage, sub.key)) return { removed: false, blocked: true };

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
 * Borra una categoría personalizada. Solo se permite si **no tiene ninguna
 * referencia**: movimientos, ítems de tickets, líneas de presupuesto de
 * cualquier mes, ni referencias de sus subcategorías personalizadas. La
 * comprobación se repite aquí en el servidor.
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<{ removed: boolean, blocked?: boolean }>}
 */
export async function deleteCustomCategory(userId, id) {
	const db = await getDb();
	if (!ObjectId.isValid(id)) return { removed: false };
	const cat = await db
		.collection('categories')
		.findOne({ _id: new ObjectId(id), userId, isCustom: true });
	if (!cat) return { removed: false };

	const usage = await getCatalogUsage(userId);
	const customSubs = await db
		.collection('user_subcategories')
		.find({ userId, categoryId: cat._id })
		.toArray();
	const subKeys = customSubs.map((s) => s.key);
	if (categoryHasReferences(usage, cat._id.toString(), subKeys)) {
		return { removed: false, blocked: true };
	}

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
