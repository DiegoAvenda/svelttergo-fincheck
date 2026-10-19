/**
 * Utilidades puras para el presupuesto mensual (gastos PLANEADOS vs. REALES).
 * Todos los montos están expresados en centavos.
 */
import { parseAmountToCents } from './money.js';

/**
 * Suma los montos planeados de las líneas del presupuesto.
 * @param {Array<{ plannedCents?: number }>} [lines]
 * @returns {number}
 */
export function sumPlannedCents(lines) {
	return (lines || []).reduce((total, line) => total + (Number(line?.plannedCents) || 0), 0);
}

/**
 * Suma el gasto REAL registrado en las categorías del presupuesto.
 * @param {Array<{ spentCents?: number }>} [lines]
 * @returns {number}
 */
export function sumSpentCents(lines) {
	return (lines || []).reduce((total, line) => total + (Number(line?.spentCents) || 0), 0);
}

/**
 * Cuánto quedaría del ingreso tras cubrir el presupuesto planeado.
 * Retorna `null` si no hay un ingreso de referencia (no se puede calcular).
 * @param {number|null|undefined} incomeCents
 * @param {number} plannedCents
 * @returns {number|null}
 */
export function remainingFromIncome(incomeCents, plannedCents) {
	if (incomeCents === null || incomeCents === undefined) return null;
	return incomeCents - plannedCents;
}

/**
 * Porcentaje del ingreso comprometido por el presupuesto, redondeado.
 * Retorna `null` si no hay ingreso válido.
 * @param {number} plannedCents
 * @param {number|null|undefined} incomeCents
 * @returns {number|null}
 */
export function budgetUsedPct(plannedCents, incomeCents) {
	if (!incomeCents || incomeCents <= 0) return null;
	return Math.round((plannedCents / incomeCents) * 100);
}

/**
 * Porcentaje consumido de una categoría respecto a lo planeado.
 * Retorna 0 si no se planeó nada (evita división por cero).
 * @param {number} spentCents
 * @param {number} plannedCents
 * @returns {number}
 */
export function lineProgressPct(spentCents, plannedCents) {
	if (!plannedCents || plannedCents <= 0) return 0;
	return Math.round((spentCents / plannedCents) * 100);
}

/**
 * Agrupa las líneas por categoría y suma lo planeado de cada una.
 * Sirve igual para líneas a nivel categoría (`subcategoryKey: null`) y por
 * subcategoría: lo que importa es el total planeado por categoría.
 * @param {Array<{ categoryId?: { toString(): string }|string, plannedCents?: number }>} [lines]
 * @returns {Map<string, number>} categoryId (string) -> centavos planeados
 */
export function plannedCentsByCategory(lines) {
	/** @type {Map<string, number>} */
	const map = new Map();
	for (const line of lines || []) {
		const id = line?.categoryId?.toString?.() ?? (line?.categoryId ? String(line.categoryId) : '');
		if (!id) continue;
		map.set(id, (map.get(id) || 0) + (Number(line?.plannedCents) || 0));
	}
	return map;
}

/**
 * Número de categorías con algo planeado (> 0).
 * @param {Array<{ categoryId?: { toString(): string }|string, plannedCents?: number }>} [lines]
 * @returns {number}
 */
export function plannedCategoryCount(lines) {
	let count = 0;
	for (const cents of plannedCentsByCategory(lines).values()) {
		if (cents > 0) count++;
	}
	return count;
}

/**
 * Convierte las entradas de un FormData de presupuesto en líneas planas.
 *
 * Nombres esperados de los campos:
 *   `general|<categoryId>`            -> monto general de la categoría (subcategoryKey null)
 *   `sub|<categoryId>|<subcategoryKey>` -> monto de esa subcategoría
 *
 * Reglas:
 *  - Una categoría está "incluida" si llega su campo `general|...` (aunque sea 0).
 *  - Solo se conservan subcategorías de categorías incluidas.
 *  - Las subcategorías vacías se omiten (no se guardan como 0).
 *  - Se ignora cualquier categoría/subcategoría que no pase la validación.
 *
 * @param {Iterable<[string, any]>} entries
 * @param {{
 *   isValidCategory?: (categoryId: string) => boolean,
 *   isValidSubcategory?: (categoryId: string, subcategoryKey: string) => boolean
 * }} [options]
 * @returns {{ lines: Array<{ categoryId: string, subcategoryKey: string|null, plannedCents: number }>, hasErrors: boolean }}
 */
export function buildBudgetLinesFromForm(entries, options = {}) {
	const isValidCategory = options.isValidCategory ?? (() => true);
	const isValidSubcategory = options.isValidSubcategory ?? (() => true);

	/** @type {Map<string, number>} */
	const general = new Map();
	/** @type {Array<{ categoryId: string, subcategoryKey: string, plannedCents: number }>} */
	const subs = [];
	let hasErrors = false;

	for (const [rawName, rawValue] of entries) {
		const parts = String(rawName).split('|');
		const value = String(rawValue ?? '').trim();

		if (parts[0] === 'general' && parts[1]) {
			const id = parts[1];
			if (!isValidCategory(id)) continue;
			const cents = value === '' ? 0 : parseAmountToCents(value);
			if (cents === null || cents < 0) {
				hasErrors = true;
				continue;
			}
			general.set(id, cents);
			continue;
		}

		if (parts[0] === 'sub' && parts[1] && parts[2]) {
			const id = parts[1];
			const subcategoryKey = parts[2];
			if (!isValidCategory(id) || !isValidSubcategory(id, subcategoryKey)) continue;
			if (value === '') continue;
			const cents = parseAmountToCents(value);
			if (cents === null || cents < 0) {
				hasErrors = true;
				continue;
			}
			if (cents <= 0) continue;
			subs.push({ categoryId: id, subcategoryKey, plannedCents: cents });
		}
	}

	/** @type {Array<{ categoryId: string, subcategoryKey: string|null, plannedCents: number }>} */
	const lines = [];
	for (const [id, cents] of general) {
		lines.push({ categoryId: id, subcategoryKey: null, plannedCents: cents });
	}
	for (const s of subs) {
		if (general.has(s.categoryId)) lines.push(s);
	}

	return { lines, hasErrors };
}
