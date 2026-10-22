import { getDb } from '$lib/server/db.js';

/** @typedef {{ _id: import('mongodb').ObjectId, userId: string, monthlyIncomeCents: number|null, currency: string, incomeType: 'fixed'|'variable'|null }} Settings */

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
 * @param {{ monthlyIncomeCents?: number|null, currency?: string, incomeType?: 'fixed'|'variable'|null }} data
 * @returns {Promise<import('mongodb').UpdateResult>}
 */
export async function upsertSettings(userId, data) {
	const db = await getDb();
	/** @type {Record<string, any>} */
	const set = {
		userId,
		monthlyIncomeCents: data.monthlyIncomeCents ?? null,
		currency: data.currency ?? 'MXN',
		updatedAt: new Date()
	};
	// `incomeType` es una preferencia posterior al onboarding: no la borres si
	// `upsertSettings` se vuelve a ejecutar (p. ej. al repetir la bienvenida).
	if (data.incomeType !== undefined) set.incomeType = data.incomeType ?? null;

	return db.collection('settings').updateOne(
		{ userId },
		{
			$set: set,
			$setOnInsert: {
				createdAt: new Date(),
				...(data.incomeType === undefined ? { incomeType: null } : {})
			}
		},
		{ upsert: true }
	);
}

/**
 * @param {string} userId
 * @param {Partial<Pick<Settings, 'monthlyIncomeCents' | 'currency' | 'incomeType'>>} updates
 */
export async function updateSettings(userId, updates) {
	const db = await getDb();
	return db
		.collection('settings')
		.updateOne({ userId }, { $set: { ...updates, updatedAt: new Date() } });
}
