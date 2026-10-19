import { getDb } from '$lib/server/db.js';

/**
 * @typedef {{ categoryId: import('mongodb').ObjectId, plannedCents: number }} BudgetLine
 * @typedef {{ _id: import('mongodb').ObjectId, userId: string, lines: BudgetLine[], createdAt: Date, updatedAt: Date }} Budget
 */

/**
 * Presupuesto mensual del usuario (plantilla de gastos planeados).
 * Es un único documento por usuario: sus `lines` son las categorías con
 * monto planeado. Se diferencia de los gastos reales, que viven en `movements`.
 * @param {string} userId
 * @returns {Promise<Budget|null>}
 */
export async function getBudget(userId) {
	const db = await getDb();
	return db.collection('budgets').findOne({ userId });
}

/**
 * Reemplaza por completo las líneas del presupuesto del usuario (upsert).
 * @param {string} userId
 * @param {BudgetLine[]} lines
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function setBudgetLines(userId, lines) {
	const db = await getDb();
	const now = new Date();
	return db.collection('budgets').updateOne(
		{ userId },
		{
			$set: { lines, updatedAt: now },
			$setOnInsert: { userId, createdAt: now }
		},
		{ upsert: true }
	);
}
