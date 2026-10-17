import { getDb } from '$lib/server/db.js';

/** @typedef {{ _id: import('mongodb').ObjectId, userId: string, monthlyIncomeCents: number|null, currency: string, monthStartDay: number }} Settings */

/**
 * @param {string} userId
 * @returns {Promise<Settings|null>}
 */
export async function getSettings(userId) {
	const db = await getDb();
	return db.collection('settings').findOne({ userId });
}

/**
 * @param {string} userId
 * @param {{ monthlyIncomeCents?: number|null, currency?: string, monthStartDay?: number }} data
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function upsertSettings(userId, data) {
	const db = await getDb();
	return db.collection('settings').updateOne(
		{ userId },
		{
			$set: {
				userId,
				monthlyIncomeCents: data.monthlyIncomeCents ?? null,
				currency: data.currency ?? 'MXN',
				monthStartDay: data.monthStartDay ?? 1,
				updatedAt: new Date()
			},
			$setOnInsert: {
				createdAt: new Date()
			}
		},
		{ upsert: true }
	);
}

/**
 * @param {string} userId
 * @param {Partial<Pick<Settings, 'monthlyIncomeCents' | 'currency' | 'monthStartDay'>>} updates
 */
export async function updateSettings(userId, updates) {
	const db = await getDb();
	return db.collection('settings').updateOne(
		{ userId },
		{ $set: { ...updates, updatedAt: new Date() } }
	);
}
