import { getDb } from '$lib/server/db.js';
import {
	getMonthRange,
	getMonthRangeByKey,
	monthKeyOfDate,
	todayInMX
} from '$lib/utils/periods.js';

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
 *   periodStart?: Date|null,
 *   periodEndExclusive?: Date|null,
 *   periodInferred?: boolean,
 *   plannedIncomeCents?: number|null,
 *   status?: 'draft'|'confirmed',
 *   replacedConfirmed?: boolean,
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
 * Presupuesto de un usuario para un ciclo concreto.
 * Hay como máximo un documento por `{ userId, monthKey }` y por periodo.
 * @param {string} userId
 * @param {string} monthKey - Clave canónica `YYYY-MM` del inicio del ciclo.
 * @returns {Promise<Budget|null>}
 */
export async function getBudget(userId, monthKey) {
	if (!monthKey) throw new Error('monthKey es obligatorio');
	const db = await getDb();
	// `monthKey` es único por construcción para los ciclos nuevos. El orden es
	// defensivo ante datos legacy duplicados: prefiere el periodo explícito más
	// reciente sobre un documento sin fechas.
	return db
		.collection('budgets')
		.findOne({ userId, monthKey }, { sort: { periodStart: -1, createdAt: -1 } });
}

/**
 * Último presupuesto confirmado que termina antes (o justo en) una fecha.
 * Los borradores no se usan como origen de la propuesta.
 * @param {string} userId
 * @param {Date} date
 * @returns {Promise<Budget|null>}
 */
export async function getLatestConfirmedBudgetBefore(userId, date) {
	const db = await getDb();
	return db.collection('budgets').findOne(
		{
			userId,
			status: { $ne: 'draft' },
			periodEndExclusive: { $lte: date }
		},
		{ sort: { periodEndExclusive: -1 } }
	);
}

/**
 * Presupuesto confirmado inmediatamente anterior al inicio de un ciclo.
 * Sirve para proponer el presupuesto del ciclo nuevo, aunque se hayan saltado
 * meses.
 * @param {string} userId
 * @param {Date} beforeDate
 * @returns {Promise<Budget|null>}
 */
export async function getPreviousConfirmedBudget(userId, beforeDate) {
	return getLatestConfirmedBudgetBefore(userId, beforeDate);
}

/**
 * Resuelve el ciclo (mes calendario) que contiene `referenceDate`. El ciclo
 * siempre va del día 1 al último día natural del mes; si ya existe un
 * presupuesto guardado para ese mes, se devuelve su estado.
 * @param {string} userId
 * @param {Date} [referenceDate]
 * @returns {Promise<{
 *   monthKey: string,
 *   start: Date,
 *   end: Date,
 *   status: 'draft'|'confirmed'|null,
 *   budget: Budget|null
 * }>}
 */
export async function resolveCurrentPeriod(userId, referenceDate = todayInMX()) {
	const { start, end } = getMonthRange(referenceDate);
	const monthKey = monthKeyOfDate(start);
	const budget = await getBudget(userId, monthKey);
	return {
		monthKey,
		start,
		end,
		status: budget?.status || null,
		budget: budget || null
	};
}

/**
 * Guarda las líneas y los metadatos de un presupuesto (upsert).
 *
 * Los límites del periodo se fijan al crear el documento y **no se reescriben**
 * al editar uno existente: el historial conserva sus fechas originales.
 * @param {string} userId
 * @param {string} monthKey - Clave canónica `YYYY-MM` del inicio del ciclo.
 * @param {{
 *   lines?: BudgetLine[],
 *   plannedIncomeCents?: number|null,
 *   status?: 'draft'|'confirmed',
 *   replacedConfirmed?: boolean,
 *   periodStart?: Date|null,
 *   periodEndExclusive?: Date|null
 * }} data
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function setBudget(userId, monthKey, data = {}) {
	if (!monthKey) throw new Error('monthKey es obligatorio');
	const db = await getDb();
	const budgets = db.collection('budgets');
	const now = new Date();
	const lines = data.lines || [];
	const status = data.status === 'draft' ? 'draft' : 'confirmed';
	const plannedIncomeCents =
		data.plannedIncomeCents === null || data.plannedIncomeCents === undefined
			? null
			: Number(data.plannedIncomeCents);

	// Mismo orden que `getBudget` para actualizar el documento que ve la UI si
	// hubiera datos legacy duplicados con el mismo `monthKey`.
	const existing = await budgets.findOne(
		{ userId, monthKey },
		{ sort: { periodStart: -1, createdAt: -1 } }
	);
	if (existing) {
		/** @type {Record<string, any>} */
		const set = {
			lines,
			plannedIncomeCents,
			status,
			replacedConfirmed: !!data.replacedConfirmed,
			updatedAt: now
		};
		// Completa límites faltantes (documentos legacy) sin mover los existentes.
		if (!existing.periodStart && data.periodStart) set.periodStart = data.periodStart;
		if (!existing.periodEndExclusive && data.periodEndExclusive) {
			set.periodEndExclusive = data.periodEndExclusive;
		}
		return budgets.updateOne({ _id: existing._id, userId }, { $set: set });
	}

	const periodStart = data.periodStart || null;
	const periodEndExclusive = data.periodEndExclusive || null;

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return await budgets.updateOne(
				{ userId, monthKey },
				{
					$set: {
						lines,
						plannedIncomeCents,
						status,
						replacedConfirmed: !!data.replacedConfirmed,
						updatedAt: now,
						...(periodStart ? { periodStart } : {}),
						...(periodEndExclusive ? { periodEndExclusive } : {})
					},
					$setOnInsert: { userId, monthKey, createdAt: now }
				},
				{ upsert: true }
			);
		} catch (err) {
			// Carrera entre dos upserts con el índice único de periodo: adopta el
			// documento ya creado en lugar de duplicarlo.
			if (/** @type {any} */ (err)?.code === 11000 && attempt === 0) {
				const byPeriod = periodStart ? await budgets.findOne({ userId, periodStart }) : null;
				if (byPeriod) {
					return budgets.updateOne(
						{ _id: byPeriod._id, userId },
						{
							$set: {
								monthKey,
								lines,
								plannedIncomeCents,
								status,
								replacedConfirmed: !!data.replacedConfirmed,
								updatedAt: now
							}
						}
					);
				}
				continue;
			}
			throw err;
		}
	}

	throw new Error('No se pudo guardar el presupuesto');
}

/**
 * Compatibilidad con llamadas anteriores. Prefiere `setBudget` para fijar
 * también las fechas y el estado del ciclo.
 * @param {string} userId
 * @param {string} monthKey
 * @param {BudgetLine[]} lines
 * @param {Omit<Parameters<typeof setBudget>[2], 'lines'>} [meta]
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function setBudgetLines(userId, monthKey, lines, meta = {}) {
	return setBudget(userId, monthKey, { ...meta, lines });
}

/**
 * Borra el presupuesto de un ciclo (se usa para descartar un borrador).
 * @param {string} userId
 * @param {string} monthKey
 * @returns {Promise<import('mongodb').DeleteResult>}
 */
export async function deleteBudget(userId, monthKey) {
	const db = await getDb();
	return db.collection('budgets').deleteOne({ userId, monthKey });
}

/**
 * Borra un presupuesto por su `_id`. Es la forma segura de descartar un
 * borrador cuando pudiera haber más de un documento legacy con el mismo
 * `monthKey`.
 * @param {string} userId
 * @param {import('mongodb').ObjectId} budgetId
 * @returns {Promise<import('mongodb').DeleteResult>}
 */
export async function deleteBudgetById(userId, budgetId) {
	const db = await getDb();
	return db.collection('budgets').deleteOne({ _id: budgetId, userId });
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
 * actual. Es la única interpretación segura: antes existía un único
 * presupuesto por usuario y era el vigente. Nunca pisa un presupuesto que ya
 * exista para el ciclo destino ni modifica importes.
 * @param {string} userId
 * @param {string} currentMonthKey
 * @returns {Promise<{ migrated: number }>}
 */
export async function migrateLegacyBudgets(userId, currentMonthKey) {
	if (!currentMonthKey) return { migrated: 0 };
	const db = await getDb();
	const budgets = db.collection('budgets');
	const legacyDocs = await budgets.find({ userId, ...LEGACY_MONTH_FILTER }).toArray();
	const range = getMonthRangeByKey(currentMonthKey);

	let migrated = 0;
	for (const doc of legacyDocs) {
		const existing = await budgets.findOne({
			userId,
			monthKey: currentMonthKey,
			_id: { $ne: doc._id }
		});
		// Si ya hay un presupuesto del ciclo actual, se conserva el legacy intacto
		// para no sobrescribir datos; queda fuera de las consultas mensuales.
		if (existing) continue;

		try {
			const now = new Date();
			const res = await budgets.updateOne(
				{ _id: doc._id, userId },
				{
					$set: {
						monthKey: currentMonthKey,
						periodStart: range.start,
						periodEndExclusive: range.end,
						periodInferred: true,
						status: doc.status === 'draft' ? 'draft' : 'confirmed',
						plannedIncomeCents: doc.plannedIncomeCents ?? null,
						migratedAt: now,
						updatedAt: now
					}
				}
			);
			if (res.modifiedCount > 0) migrated++;
		} catch (err) {
			// Otra solicitud lo migró primero: el resultado es el mismo.
			if (/** @type {any} */ (err)?.code !== 11000) throw err;
		}
	}

	return { migrated };
}

/**
 * Rellena `periodStart`, `periodEndExclusive`, `status` y `plannedIncomeCents`
 * en presupuestos anteriores al modelo de ciclos explícitos. Es idempotente y
 * no inventa presupuestos ni ingresos: solo marca los límites como inferidos
 * (mes calendario).
 * @param {string} userId
 * @returns {Promise<{ migrated: number }>}
 */
export async function migrateBudgetPeriods(userId) {
	const db = await getDb();
	const budgets = db.collection('budgets');
	const docs = await budgets
		.find({
			userId,
			monthKey: { $regex: CANONICAL_MONTH_REGEX },
			$or: [
				{ periodStart: { $exists: false } },
				{ periodStart: null },
				{ periodEndExclusive: { $exists: false } },
				{ periodEndExclusive: null }
			]
		})
		.toArray();

	let migrated = 0;
	for (const doc of docs) {
		try {
			const range = getMonthRangeByKey(doc.monthKey);
			const res = await budgets.updateOne(
				{ _id: doc._id, userId },
				{
					$set: {
						periodStart: range.start,
						periodEndExclusive: range.end,
						periodInferred: true,
						status: doc.status === 'draft' ? 'draft' : 'confirmed',
						plannedIncomeCents: doc.plannedIncomeCents ?? null,
						updatedAt: new Date()
					}
				}
			);
			if (res.modifiedCount > 0) migrated++;
		} catch (err) {
			// Otro proceso ya migró el mismo periodo.
			if (/** @type {any} */ (err)?.code !== 11000) throw err;
		}
	}

	return { migrated };
}
