import { getDb } from '$lib/server/db.js';

/**
 * Crea los índices necesarios para las colecciones de contlana.
 * Se ejecuta una vez al inicio de la app.
 */
export async function ensureIndexes() {
	const db = await getDb();

	await Promise.all([
		// Movements
		db.collection('movements').createIndex({ userId: 1, date: -1 }),
		db.collection('movements').createIndex({ userId: 1, categoryId: 1, date: -1 }),

		// Categories
		db.collection('categories').createIndex({ userId: 1 }),

		// Settings
		db.collection('settings').createIndex({ userId: 1 }, { unique: true }),

		// Budgets (presupuesto mensual, uno por usuario)
		db.collection('budgets').createIndex({ userId: 1 }, { unique: true }),

		// Item corrections (solo ambigüedades aclaradas por el usuario)
		db.collection('item_corrections').createIndex({ userId: 1, itemCode: 1 }),
		db.collection('item_corrections').createIndex({ userId: 1, store: 1, normalizedDescription: 1 })
	]);
}
