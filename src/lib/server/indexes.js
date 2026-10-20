import { getDb } from '$lib/server/db.js';

/** Documentos del modelo anterior, sin `monthKey`. */
const LEGACY_MONTH_FILTER = {
	$or: [{ monthKey: { $exists: false } }, { monthKey: null }, { monthKey: '' }]
};

/**
 * Elimina el índice único legacy `{ userId: 1 }` (impedía tener más de un mes)
 * y deja un único índice `{ userId: 1, monthKey: 1 }`.
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

	for (const index of indexes) {
		if (index.name === '_id_') continue;
		const keys = Object.keys(index.key || {});
		// Cualquier índice de un solo campo `userId` es del modelo legacy.
		if (keys.length === 1 && keys[0] === 'userId') {
			try {
				await budgets.dropIndex(index.name);
			} catch (err) {
				if (/** @type {any} */ (err)?.code !== 27) throw err;
			}
		}
	}

	// Si por datos corruptos hubiera varios legacy por usuario, se conserva el
	// más reciente con `monthKey: null` (luego se migra al mes actual) y los
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

	await budgets.createIndex({ userId: 1, monthKey: 1 }, { unique: true });
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

	// Presupuestos: un documento por usuario y mes. Debe correr después de
	// retirar el índice único legacy por usuario.
	await ensureBudgetIndexes(db);
}
