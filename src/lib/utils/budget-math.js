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
 * ¿El presupuesto tiene al menos una línea con monto planeado > 0?
 * No filtra por visibilidad: las líneas ocultas conservadas cuentan.
 * @param {Array<{ plannedCents?: number }>} [lines]
 * @returns {boolean}
 */
export function budgetHasPlanned(lines) {
	return (lines || []).some((line) => (Number(line?.plannedCents) || 0) > 0);
}

/**
 * Copia profunda-ligera de las líneas de un presupuesto. Conserva las
 * referencias estables (`categoryId`, `subcategoryKey`) y los nombres
 * snapshot, sin compartir objetos con el origen.
 * @param {Array<{
 *   categoryId?: any,
 *   subcategoryKey?: string|null,
 *   plannedCents?: number,
 *   categoryName?: string|null,
 *   subcategoryName?: string|null,
 *   customKey?: string|null,
 *   customName?: string|null
 * }>} [lines]
 * @returns {Array<{
 *   categoryId: any,
 *   subcategoryKey: string|null,
 *   plannedCents: number,
 *   categoryName?: string,
 *   subcategoryName?: string,
 *   customKey?: string,
 *   customName?: string
 * }>}
 */
export function cloneBudgetLines(lines) {
	return (lines || []).map((line) => ({
		categoryId: line?.categoryId ?? null,
		subcategoryKey: line?.subcategoryKey ?? null,
		plannedCents: Number(line?.plannedCents) || 0,
		...(line?.categoryName ? { categoryName: String(line.categoryName) } : {}),
		...(line?.subcategoryName ? { subcategoryName: String(line.subcategoryName) } : {}),
		...(line?.customKey ? { customKey: String(line.customKey) } : {}),
		...(line?.customName ? { customName: String(line.customName) } : {})
	}));
}

/**
 * Filtra las líneas que se pueden proponer en un ciclo nuevo: solo categorías
 * y subcategorías visibles. No muta el origen. Las líneas ocultas de ciclos
 * existentes se conservan en su propio presupuesto; al proponer no se arrastran.
 * @param {Array<{ categoryId?: any, subcategoryKey?: string|null }>} [lines]
 * @param {{
 *   isCategoryVisible: (categoryId: string) => boolean,
 *   isSubcategoryVisible?: (categoryId: string, subcategoryKey: string) => boolean
 * }} options
 * @returns {Array<{ categoryId?: any, subcategoryKey?: string|null }>}
 */
export function filterVisibleBudgetLines(lines, options) {
	const isCategoryVisible = options?.isCategoryVisible ?? (() => true);
	const isSubcategoryVisible = options?.isSubcategoryVisible ?? (() => true);
	return (lines || []).filter((line) => {
		const cid = line?.categoryId?.toString?.() ?? (line?.categoryId ? String(line.categoryId) : '');
		if (!cid || !isCategoryVisible(cid)) return false;
		if (line?.subcategoryKey && !isSubcategoryVisible(cid, line.subcategoryKey)) return false;
		return true;
	});
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
 * Sirve igual para líneas a nivel categoría (`subcategoryKey: null`), por
 * subcategoría y para categorías personalizadas (`customKey`).
 * @param {Array<{ categoryId?: { toString(): string }|string|null, customKey?: string|null, plannedCents?: number }>} [lines]
 * @returns {Map<string, number>} clave de categoría (string) -> centavos planeados
 */
export function plannedCentsByCategory(lines) {
	/** @type {Map<string, number>} */
	const map = new Map();
	for (const line of lines || []) {
		const id =
			line?.categoryId?.toString?.() ??
			line?.customKey ??
			(line?.categoryId ? String(line.categoryId) : '');
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
 *   `general|<categoryId>`              -> monto general de la categoría (subcategoryKey null)
 *   `sub|<categoryId>|<subcategoryKey>` -> monto de esa subcategoría
 *   `customName|<customKey>`            -> nombre de una categoría personalizada
 *   `custom|<customKey>`                -> monto de esa categoría personalizada
 *
 * Reglas:
 *  - Una categoría del catálogo está "incluida" si llega su campo `general|...` (aunque sea 0).
 *  - Solo se conservan subcategorías de categorías incluidas.
 *  - Las subcategorías vacías se omiten (no se guardan como 0).
 *  - Una categoría personalizada se incluye si su nombre llega con texto (el monto vacío = 0).
 *  - Se ignora cualquier categoría/subcategoría que no pase la validación.
 *
 * @param {Iterable<[string, any]>} entries
 * @param {{
 *   isValidCategory?: (categoryId: string) => boolean,
 *   isValidSubcategory?: (categoryId: string, subcategoryKey: string) => boolean,
 *   maxCustomNameLength?: number
 * }} [options]
 * @returns {{
 *   lines: Array<{
 *     categoryId: string|null,
 *     subcategoryKey: string|null,
 *     plannedCents: number,
 *     customKey?: string,
 *     customName?: string
 *   }>,
 *   hasErrors: boolean
 * }}
 */
export function buildBudgetLinesFromForm(entries, options = {}) {
	const isValidCategory = options.isValidCategory ?? (() => true);
	const isValidSubcategory = options.isValidSubcategory ?? (() => true);
	const maxCustomNameLength = options.maxCustomNameLength ?? 60;

	/** @type {Map<string, number>} */
	const general = new Map();
	/** @type {Array<{ categoryId: string, subcategoryKey: string, plannedCents: number }>} */
	const subs = [];
	/** @type {Map<string, string>} */
	const customNames = new Map();
	/** @type {Map<string, number>} */
	const customAmounts = new Map();
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
			continue;
		}

		if (parts[0] === 'customName' && parts[1]) {
			customNames.set(parts[1], value.slice(0, maxCustomNameLength));
			continue;
		}

		if (parts[0] === 'custom' && parts[1]) {
			const cents = value === '' ? 0 : parseAmountToCents(value);
			if (cents === null || cents < 0) {
				hasErrors = true;
				continue;
			}
			customAmounts.set(parts[1], cents);
		}
	}

	/** @type {Array<{
	 *   categoryId: string|null,
	 *   subcategoryKey: string|null,
	 *   plannedCents: number,
	 *   customKey?: string,
	 *   customName?: string
	 * }>} */
	const lines = [];
	for (const [id, cents] of general) {
		lines.push({ categoryId: id, subcategoryKey: null, plannedCents: cents });
	}
	for (const s of subs) {
		if (general.has(s.categoryId)) lines.push(s);
	}
	for (const [key, name] of customNames) {
		if (!name) continue;
		lines.push({
			categoryId: null,
			customKey: key,
			customName: name,
			subcategoryKey: null,
			plannedCents: customAmounts.get(key) ?? 0
		});
	}

	return { lines, hasErrors };
}
