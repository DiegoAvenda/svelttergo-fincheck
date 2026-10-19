import { getDb } from '$lib/server/db.js';

/**
 * Gasto real por categoría y subcategoría en un rango de fechas.
 * Para tickets con detalle suma por artículo (usa `items.subcategoryKey`);
 * para movimientos simples usa `subcategoryKey` del propio movimiento.
 *
 * @param {string} userId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Array<{ categoryId: import('mongodb').ObjectId|null, subcategoryKey: string|null, totalCents: number }>>}
 */
export async function getSpendingByCategorySubcategory(userId, startDate, endDate) {
	const db = await getDb();

	const itemsPipeline = [
		{
			$match: {
				userId,
				type: 'expense',
				date: { $gte: startDate, $lt: endDate },
				'items.0': { $exists: true }
			}
		},
		{ $unwind: '$items' },
		{
			$group: {
				_id: { categoryId: '$items.categoryId', subcategoryKey: '$items.subcategoryKey' },
				totalCents: { $sum: '$items.amountCents' }
			}
		}
	];

	const simplePipeline = [
		{
			$match: {
				userId,
				type: 'expense',
				date: { $gte: startDate, $lt: endDate },
				$or: [{ items: { $exists: false } }, { items: { $size: 0 } }]
			}
		},
		{
			$group: {
				_id: { categoryId: '$categoryId', subcategoryKey: '$subcategoryKey' },
				totalCents: { $sum: '$amountCents' }
			}
		}
	];

	const [itemsResult, simpleResult] = await Promise.all([
		db.collection('movements').aggregate(itemsPipeline).toArray(),
		db.collection('movements').aggregate(simplePipeline).toArray()
	]);

	/** @type {Map<string, { categoryId: ObjectId|null, subcategoryKey: string|null, totalCents: number }>} */
	const combined = new Map();

	for (const r of [...itemsResult, ...simpleResult]) {
		const categoryId = r._id?.categoryId ?? null;
		const subcategoryKey = r._id?.subcategoryKey ?? null;
		const key = `${categoryId ? categoryId.toString() : 'null'}|${subcategoryKey ?? ''}`;
		const existing = combined.get(key);
		if (existing) {
			existing.totalCents += r.totalCents;
		} else {
			combined.set(key, { categoryId, subcategoryKey, totalCents: r.totalCents });
		}
	}

	return Array.from(combined.values());
}
