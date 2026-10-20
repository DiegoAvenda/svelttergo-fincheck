import { getDb } from '$lib/server/db.js';

/** Documentos del modelo anterior, sin `monthKey`. */
const LEGACY_MONTH_FILTER = {
	$or: [{ monthKey: { $exists: false } }, { monthKey: null }, { monthKey: '' }]
};

/**
 * Índices de presupuestos:
 *  - único por `{ userId, periodStart }` (parcial: solo documentos con fechas),
 *  - no único por `{ userId, monthKey }` para navegación/compatibilidad.
 *
 * El índice único anterior `{ userId, monthKey }` se retira porque la identidad
 * del presupuesto son los límites del periodo. `monthKey` se conserva como
 * índice no único de navegación/compatibilidad; la unicidad de periodo la
 * garantiza el índice parcial `{ userId, periodStart }`.
 * @param {import('mongodb').Db} db
 */
async function ensureBudgetIndexes(db) {
	const budgets = db.collection('budgets');

	/** @type {any[]} */
	let indexes = [];
	try {
		indexes = await budgets.listIndexes().toArray();
	} catch (err) {
		// La colección aún no existe: createIndex la creará.
		if (/** @type {any} */ (err)?.code !== 26) throw err;
	}

	let hasGoodPeriodIndex = false;
	let hasMonthIndex = false;

	for (const index of indexes) {
		if (index.name === '_id_') continue;
		const keys = Object.keys(index.key || {});
		const isLegacyUser = keys.length === 1 && keys[0] === 'userId';
		const isMonthIndex = keys.length === 2 && keys[0] === 'userId' && keys[1] === 'monthKey';
		const isPeriodIndex = keys.length === 2 && keys[0] === 'userId' && keys[1] === 'periodStart';
		const isOldUniqueMonth = isMonthIndex && index.unique === true;
		const isWrongPeriod =
			isPeriodIndex && (index.unique !== true || !index.partialFilterExpression?.periodStart);

		if (isLegacyUser || isOldUniqueMonth || isWrongPeriod) {
			try {
				await budgets.dropIndex(index.name);
			} catch (err) {
				if (/** @type {any} */ (err)?.code !== 27) throw err;
			}
			continue;
		}
		if (isMonthIndex) hasMonthIndex = true;
		if (isPeriodIndex && index.unique === true && index.partialFilterExpression?.periodStart) {
			hasGoodPeriodIndex = true;
		}
	}

	// Si por datos corruptos hubiera varios legacy por usuario, se conserva el
	// más reciente con `monthKey: null` (luego se migra al ciclo actual) y los
	// demás se apartan con una clave no canónica para no perder información.
	/** @type {any[]} */
	const legacyDocs = await budgets
		.find(LEGACY_MONTH_FILTER)
		.sort({ updatedAt: -1, createdAt: -1 })
		.toArray();
	/** @type {Map<string, any[]>} */
	const byUser = new Map();
	for (const doc of legacyDocs) {
		const list = byUser.get(doc.userId) || [];
		list.push(doc);
		byUser.set(doc.userId, list);
	}
	for (const docs of byUser.values()) {
		for (const doc of docs.slice(1)) {
			await budgets.updateOne(
				{ _id: doc._id },
				{ $set: { monthKey: `legacy-${doc._id.toString()}`, isLegacy: true } }
			);
		}
	}

	if (!hasGoodPeriodIndex) {
		// Deduplica periodos antes de crear el índice único. El documento más
		// reciente conserva el periodo; los demás se apartan sin borrar datos.
		/** @type {any[]} */
		const withPeriod = await budgets
			.find({ periodStart: { $type: 'date' } })
			.sort({ updatedAt: -1, createdAt: -1 })
			.toArray();
		const seen = new Set();
		for (const doc of withPeriod) {
			const key = `${doc.userId}|${doc.periodStart.toISOString()}`;
			if (seen.has(key)) {
				await budgets.updateOne(
					{ _id: doc._id },
					{
						$set: {
							isLegacyDuplicate: true,
							monthKey: `legacy-${doc._id.toString()}`
						},
						$unset: { periodStart: '', periodEndExclusive: '' }
					}
				);
				continue;
			}
			seen.add(key);
		}

		await budgets.createIndex(
			{ userId: 1, periodStart: 1 },
			{ unique: true, partialFilterExpression: { periodStart: { $type: 'date' } } }
		);
	}

	if (!hasMonthIndex) {
		await budgets.createIndex({ userId: 1, monthKey: 1 });
	}
}

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
		db.collection('categories').createIndex({ userId: 1, isCustom: 1 }),

		// Custom subcategories (creadas por el usuario)
		db.collection('user_subcategories').createIndex({ userId: 1, categoryId: 1 }),
		db.collection('user_subcategories').createIndex({ userId: 1, key: 1 }, { unique: true }),

		// Settings
		db.collection('settings').createIndex({ userId: 1 }, { unique: true }),

		// Item corrections (solo ambigüedades aclaradas por el usuario)
		db.collection('item_corrections').createIndex({ userId: 1, itemCode: 1 }),
		db.collection('item_corrections').createIndex({ userId: 1, store: 1, normalizedDescription: 1 })
	]);

	// Presupuestos: un documento por usuario y periodo explícito. Debe correr
	// después de retirar los índices legacy.
	await ensureBudgetIndexes(db);
}
