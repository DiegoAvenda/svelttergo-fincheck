import { getDb } from '$lib/server/db.js';
import { ObjectId } from 'mongodb';

/**
 * @typedef {{ originalDescription: string, amountCents: number, categoryId: ObjectId|null, subcategoryKey?: string|null }} MovementItem
 * @typedef {{ _id: ObjectId, userId: string, type: 'expense'|'income', amountCents: number, date: Date, merchant: string|null, categoryId: ObjectId|null, subcategoryKey?: string|null, categoryKey?: string|null, note: string|null, source: 'manual'|'ticket', items: MovementItem[], createdAt: Date, updatedAt: Date }} Movement
 */

/**
 * @param {string} userId
 * @param {Omit<Movement, '_id' | 'userId' | 'createdAt' | 'updatedAt'>} data
 */
export async function createMovement(userId, data) {
	const db = await getDb();
	const now = new Date();
	return db.collection('movements').insertOne({
		userId,
		type: data.type,
		amountCents: data.amountCents,
		date: data.date,
		merchant: data.merchant || null,
		categoryId: data.categoryId || null,
		subcategoryKey: data.subcategoryKey || null,
		categoryKey: data.categoryKey || null,
		note: data.note || null,
		source: data.source,
		items: data.items || [],
		createdAt: now,
		updatedAt: now
	});
}

/**
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<Movement|null>}
 */
export async function getMovementById(userId, id) {
	const db = await getDb();
	return db.collection('movements').findOne({ _id: new ObjectId(id), userId });
}

/**
 * @param {string} userId
 * @param {string} id
 * @param {Partial<Movement>} updates
 */
export async function updateMovement(userId, id, updates) {
	const db = await getDb();
	return db
		.collection('movements')
		.updateOne({ _id: new ObjectId(id), userId }, { $set: { ...updates, updatedAt: new Date() } });
}

/**
 * @param {string} userId
 * @param {string} id
 */
export async function deleteMovement(userId, id) {
	const db = await getDb();
	return db.collection('movements').deleteOne({ _id: new ObjectId(id), userId });
}

/**
 * Lista movimientos con filtros, búsqueda y paginación.
 * @param {string} userId
 * @param {{ search?: string, categoryId?: string, startDate?: Date, endDate?: Date, skip?: number, limit?: number }} options
 * @returns {Promise<{ movements: Movement[], total: number }>}
 */
export async function listMovements(userId, options = {}) {
	const db = await getDb();
	const { search, categoryId, startDate, endDate, skip = 0, limit = 20 } = options;

	/** @type {import('mongodb').Filter<any>} */
	const filter = { userId };

	if (startDate || endDate) {
		filter.date = {};
		if (startDate) filter.date.$gte = startDate;
		if (endDate) filter.date.$lt = endDate;
	}

	if (categoryId) {
		const catOid = new ObjectId(categoryId);
		filter.$or = [{ categoryId: catOid }, { 'items.categoryId': catOid }];
	}

	if (search) {
		const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		const searchOr = [{ merchant: regex }, { note: regex }, { 'items.originalDescription': regex }];
		if (filter.$or) {
			// Combinar con el filtro de categoría
			filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
			delete filter.$or;
		} else {
			filter.$or = searchOr;
		}
	}

	const [movements, total] = await Promise.all([
		db
			.collection('movements')
			.find(filter)
			.sort({ date: -1, createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.toArray(),
		db.collection('movements').countDocuments(filter)
	]);

	return { movements, total };
}

/**
 * Últimos N movimientos de un usuario.
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Movement[]>}
 */
export async function getRecentMovements(userId, limit = 8) {
	const db = await getDb();
	return db
		.collection('movements')
		.find({ userId })
		.sort({ date: -1, createdAt: -1 })
		.limit(limit)
		.toArray();
}

/**
 * Suma de ingresos en un rango de fechas.
 * @param {string} userId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<number>}
 */
export async function sumIncomeInRange(userId, startDate, endDate) {
	const db = await getDb();
	const result = await db
		.collection('movements')
		.aggregate([
			{ $match: { userId, type: 'income', date: { $gte: startDate, $lt: endDate } } },
			{ $group: { _id: null, total: { $sum: '$amountCents' } } }
		])
		.toArray();
	return result[0]?.total ?? 0;
}

/**
 * Suma de gastos en un rango de fechas.
 * @param {string} userId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<number>}
 */
export async function sumExpensesInRange(userId, startDate, endDate) {
	const db = await getDb();
	const result = await db
		.collection('movements')
		.aggregate([
			{ $match: { userId, type: 'expense', date: { $gte: startDate, $lt: endDate } } },
			{ $group: { _id: null, total: { $sum: '$amountCents' } } }
		])
		.toArray();
	return result[0]?.total ?? 0;
}

/**
 * Cuenta total de movimientos de un usuario.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countMovements(userId) {
	const db = await getDb();
	return db.collection('movements').countDocuments({ userId });
}

/**
 * Fecha del movimiento más antiguo del usuario. Sirve para limitar la
 * navegación del historial de presupuestos hasta donde hay datos reales.
 * @param {string} userId
 * @returns {Promise<Date|null>}
 */
export async function getEarliestMovementDate(userId) {
	const db = await getDb();
	const doc = await db.collection('movements').find({ userId }).sort({ date: 1 }).limit(1).next();
	return doc?.date ?? null;
}
