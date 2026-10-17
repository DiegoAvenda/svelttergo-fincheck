import { getDb } from '$lib/server/db.js';

/**
 * Crea los índices necesarios para las colecciones de Fincheck.
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

		// Classification memory
		db
			.collection('classification_memory')
			.createIndex({ userId: 1, normalizedDescription: 1 }, { unique: true })
	]);
}
