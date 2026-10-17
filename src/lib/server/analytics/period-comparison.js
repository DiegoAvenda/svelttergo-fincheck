import { getSpendingByCategory } from './spending-by-category.js';

/**
 * Compara el gasto por categoría entre dos periodos.
 * @param {string} userId
 * @param {{ start: Date, end: Date }} currentRange
 * @param {{ start: Date, end: Date }} previousRange
 * @returns {Promise<Map<string, { currentCents: number, previousCents: number, changePct: number|null }>>}
 */
export async function getPeriodComparison(userId, currentRange, previousRange) {
	const [current, previous] = await Promise.all([
		getSpendingByCategory(userId, currentRange.start, currentRange.end),
		getSpendingByCategory(userId, previousRange.start, previousRange.end)
	]);

	/** @type {Map<string, { currentCents: number, previousCents: number, changePct: number|null }>} */
	const result = new Map();

	// Agregar datos del periodo actual
	for (const entry of current) {
		const key = entry.categoryId?.toString() ?? 'null';
		result.set(key, {
			currentCents: entry.totalCents,
			previousCents: 0,
			changePct: null
		});
	}

	// Agregar datos del periodo anterior
	for (const entry of previous) {
		const key = entry.categoryId?.toString() ?? 'null';
		const existing = result.get(key);
		if (existing) {
			existing.previousCents = entry.totalCents;
		} else {
			result.set(key, {
				currentCents: 0,
				previousCents: entry.totalCents,
				changePct: null
			});
		}
	}

	// Calcular porcentaje de cambio
	for (const [, data] of result) {
		if (data.previousCents > 0) {
			data.changePct = Math.round(
				((data.currentCents - data.previousCents) / data.previousCents) * 100
			);
		} else if (data.currentCents > 0) {
			data.changePct = 100; // Nuevo gasto, no había antes
		}
	}

	return result;
}
