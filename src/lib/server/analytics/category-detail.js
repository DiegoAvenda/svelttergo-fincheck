import { getDb } from '$lib/server/db.js';
import { ObjectId } from 'mongodb';

/**
 * Detalle de gasto de una categoría: total, número de compras, promedio, comercios y artículos principales.
 * @param {string} userId
 * @param {string} categoryId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<{ totalCents: number, count: number, avgCents: number, topMerchants: Array<{name: string, totalCents: number}>, topItems: Array<{description: string, totalCents: number, count: number}> }>}
 */
export async function getCategoryDetail(userId, categoryId, startDate, endDate) {
	const db = await getDb();
	const catOid = new ObjectId(categoryId);

	// Movimientos con artículos de esta categoría
	const itemsPipeline = [
		{
			$match: {
				userId,
				type: 'expense',
				date: { $gte: startDate, $lt: endDate },
				'items.categoryId': catOid
			}
		},
		{ $unwind: '$items' },
		{ $match: { 'items.categoryId': catOid } },
		{
			$group: {
				_id: null,
				totalCents: { $sum: '$items.amountCents' },
				count: { $sum: 1 },
				items: {
					$push: {
						description: '$items.originalDescription',
						amountCents: '$items.amountCents',
						merchant: '$merchant'
					}
				}
			}
		}
	];

	// Movimientos simples de esta categoría
	const simplePipeline = [
		{
			$match: {
				userId,
				type: 'expense',
				date: { $gte: startDate, $lt: endDate },
				categoryId: catOid,
				$or: [{ items: { $exists: false } }, { items: { $size: 0 } }]
			}
		},
		{
			$group: {
				_id: null,
				totalCents: { $sum: '$amountCents' },
				count: { $sum: 1 },
				merchants: { $push: '$merchant' }
			}
		}
	];

	const [itemsResult, simpleResult] = await Promise.all([
		db.collection('movements').aggregate(itemsPipeline).toArray(),
		db.collection('movements').aggregate(simplePipeline).toArray()
	]);

	let totalCents = 0;
	let count = 0;

	/** @type {Map<string, number>} */
	const merchantMap = new Map();
	/** @type {Map<string, { totalCents: number, count: number }>} */
	const itemMap = new Map();

	// Procesar artículos
	if (itemsResult[0]) {
		totalCents += itemsResult[0].totalCents;
		count += itemsResult[0].count;

		for (const item of itemsResult[0].items) {
			if (item.merchant) {
				merchantMap.set(item.merchant, (merchantMap.get(item.merchant) || 0) + item.amountCents);
			}
			const desc = item.description || 'Sin descripción';
			const existing = itemMap.get(desc);
			if (existing) {
				existing.totalCents += item.amountCents;
				existing.count += 1;
			} else {
				itemMap.set(desc, { totalCents: item.amountCents, count: 1 });
			}
		}
	}

	// Procesar simples
	if (simpleResult[0]) {
		totalCents += simpleResult[0].totalCents;
		count += simpleResult[0].count;

		for (const m of simpleResult[0].merchants) {
			if (m) {
				merchantMap.set(m, (merchantMap.get(m) || 0) + 1);
			}
		}
	}

	const avgCents = count > 0 ? Math.round(totalCents / count) : 0;

	const topMerchants = Array.from(merchantMap.entries())
		.map(([name, totalCents]) => ({ name, totalCents }))
		.sort((a, b) => b.totalCents - a.totalCents)
		.slice(0, 5);

	const topItems = Array.from(itemMap.entries())
		.map(([description, data]) => ({ description, ...data }))
		.sort((a, b) => b.totalCents - a.totalCents)
		.slice(0, 10);

	return { totalCents, count, avgCents, topMerchants, topItems };
}
