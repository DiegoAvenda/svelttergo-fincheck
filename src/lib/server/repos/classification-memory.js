import { getDb } from '$lib/server/db.js';

/**
 * Busca una clasificación memorizada para una descripción normalizada.
 * @param {string} userId
 * @param {string} normalizedDescription
 * @returns {Promise<{ categoryId: import('mongodb').ObjectId } | null>}
 */
export async function findClassification(userId, normalizedDescription) {
	const db = await getDb();
	return db.collection('classification_memory').findOne({ userId, normalizedDescription });
}

/**
 * Guarda o actualiza la clasificación de una descripción.
 * @param {string} userId
 * @param {string} normalizedDescription
 * @param {import('mongodb').ObjectId} categoryId
 */
export async function upsertClassification(userId, normalizedDescription, categoryId) {
	const db = await getDb();
	return db.collection('classification_memory').updateOne(
		{ userId, normalizedDescription },
		{
			$set: {
				categoryId,
				updatedAt: new Date()
			},
			$setOnInsert: {
				userId,
				normalizedDescription,
				createdAt: new Date()
			}
		},
		{ upsert: true }
	);
}
