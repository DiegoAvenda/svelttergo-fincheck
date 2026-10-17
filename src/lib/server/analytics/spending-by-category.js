import { getDb } from '$lib/server/db.js';
import { ObjectId } from 'mongodb';

/**
 * Calcula el gasto por categoría en un rango de fechas.
 * Para tickets con detalle, suma por artículo.
 * Para manuales/solo-total, suma por el importe del movimiento.
 *
 * @param {string} userId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Array<{ categoryId: ObjectId|null, totalCents: number, count: number }>>}
 */
export async function getSpendingByCategory(userId, startDate, endDate) {
	const db = await getDb();

	// Pipeline 1: Movimientos con detalle de artículos (source=ticket y items.length > 0)
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
				_id: '$items.categoryId',
				totalCents: { $sum: '$items.amountCents' },
				count: { $sum: 1 }
			}
		}
	];

	// Pipeline 2: Movimientos sin detalle (manuales o solo-total)
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
				_id: '$categoryId',
				totalCents: { $sum: '$amountCents' },
				count: { $sum: 1 }
			}
		}
	];

	const [itemsResult, simpleResult] = await Promise.all([
		db.collection('movements').aggregate(itemsPipeline).toArray(),
		db.collection('movements').aggregate(simplePipeline).toArray()
	]);

	// Combinar resultados
	/** @type {Map<string, { categoryId: ObjectId|null, totalCents: number, count: number }>} */
	const combined = new Map();

	for (const r of [...itemsResult, ...simpleResult]) {
		const key = r._id?.toString() ?? 'null';
		const existing = combined.get(key);
		if (existing) {
			existing.totalCents += r.totalCents;
			existing.count += r.count;
		} else {
			combined.set(key, {
				categoryId: r._id,
				totalCents: r.totalCents,
				count: r.count
			});
		}
	}

	return Array.from(combined.values()).sort((a, b) => b.totalCents - a.totalCents);
}
