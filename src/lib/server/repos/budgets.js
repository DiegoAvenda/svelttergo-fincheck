import { getDb } from '$lib/server/db.js';

/**
 * @typedef {{
 *   categoryId: import('mongodb').ObjectId|null,
 *   subcategoryKey: string|null,
 *   plannedCents: number,
 *   categoryName?: string|null,
 *   subcategoryName?: string|null,
 *   customKey?: string|null,
 *   customName?: string|null
 * }} BudgetLine
 * @typedef {{
 *   _id: import('mongodb').ObjectId,
 *   userId: string,
 *   monthKey: string,
 *   lines: BudgetLine[],
 *   createdAt: Date,
 *   updatedAt: Date
 * }} Budget
 */

/** Meses legacy sin `monthKey` (documentos del modelo anterior). */
const LEGACY_MONTH_FILTER = {
	$or: [{ monthKey: { $exists: false } }, { monthKey: null }, { monthKey: '' }]
};

/** Clave canónica `YYYY-MM`. */
const CANONICAL_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Presupuesto de un usuario para un mes contable concreto.
 * Hay como máximo un documento por `{ userId, monthKey }`.
 * @param {string} userId
 * @param {string} monthKey - Clave canónica `YYYY-MM`.
 * @returns {Promise<Budget|null>}
 */
export async function getBudget(userId, monthKey) {
	if (!monthKey) throw new Error('monthKey es obligatorio');
	const db = await getDb();
	return db.collection('budgets').findOne({ userId, monthKey });
}

/**
 * Reemplaza por completo las líneas del presupuesto de un mes (upsert).
 * Es idempotente: dos solicitudes concurrentes terminan en el mismo documento
 * gracias al índice único `{ userId, monthKey }`.
 * @param {string} userId
 * @param {string} monthKey - Clave canónica `YYYY-MM`.
 * @param {BudgetLine[]} lines
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function setBudgetLines(userId, monthKey, lines) {
	if (!monthKey) throw new Error('monthKey es obligatorio');
	const db = await getDb();
	const now = new Date();

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return await db.collection('budgets').updateOne(
				{ userId, monthKey },
				{
					$set: { lines: lines || [], updatedAt: now },
					$setOnInsert: { userId, monthKey, createdAt: now }
				},
				{ upsert: true }
			);
		} catch (err) {
			// Carrera entre dos upserts con el índice único: reintenta una vez.
			if (/** @type {any} */ (err)?.code === 11000 && attempt === 0) continue;
			throw err;
		}
	}

	throw new Error('No se pudo guardar el presupuesto');
}

/**
 * Mes más antiguo con presupuesto guardado (solo claves canónicas).
 * Sirve para limitar la navegación del historial.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getEarliestBudgetMonth(userId) {
	const db = await getDb();
	const doc = await db
		.collection('budgets')
		.find({ userId, monthKey: { $regex: CANONICAL_MONTH_REGEX } })
		.sort({ monthKey: 1 })
		.limit(1)
		.next();
	return doc?.monthKey ?? null;
}

/**
 * Migra de forma idempotente los presupuestos legacy (sin `monthKey`) al mes
 * contable actual. Es la única interpretación segura: antes existía un único
 * presupuesto por usuario y era el vigente. Nunca pisa un presupuesto que ya
 * exista para el mes destino ni modifica importes.
 * @param {string} userId
 * @param {string} currentMonthKey
 * @returns {Promise<{ migrated: number }>}
 */
export async function migrateLegacyBudgets(userId, currentMonthKey) {
	if (!currentMonthKey) return { migrated: 0 };
	const db = await getDb();
	const budgets = db.collection('budgets');
	const legacyDocs = await budgets.find({ userId, ...LEGACY_MONTH_FILTER }).toArray();

	let migrated = 0;
	for (const doc of legacyDocs) {
		const existing = await budgets.findOne({
			userId,
			monthKey: currentMonthKey,
			_id: { $ne: doc._id }
		});
		// Si ya hay un presupuesto del mes actual, se conserva el legacy intacto
		// para no sobrescribir datos; queda fuera de las consultas mensuales.
		if (existing) continue;

		try {
			const now = new Date();
			const res = await budgets.updateOne(
				{ _id: doc._id, userId },
				{ $set: { monthKey: currentMonthKey, migratedAt: now, updatedAt: now } }
			);
			if (res.modifiedCount > 0) migrated++;
		} catch (err) {
			// Otra solicitud lo migró primero: el resultado es el mismo.
			if (/** @type {any} */ (err)?.code !== 11000) throw err;
		}
	}

	return { migrated };
}
