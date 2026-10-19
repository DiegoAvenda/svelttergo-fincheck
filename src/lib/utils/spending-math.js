/**
 * Matemáticas puras de gasto/porcentajes para el dashboard.
 *
 * Se separan los dos denominadores para no mezclarlos nunca:
 *  - `pctOf` / `pctOfNullable`: porcentaje con un denominador explícito
 *    (puede ser el gasto total, el gasto de una categoría o el ingreso).
 *
 * No hay ninguna llamada a IA aquí: los porcentajes se calculan a partir de
 * los importes ya guardados.
 */

/**
 * Porcentaje entero de `partCents` sobre `wholeCents`. 0 si el total es 0.
 * @param {number} partCents
 * @param {number} wholeCents
 * @returns {number}
 */
export function pctOf(partCents, wholeCents) {
	if (!Number.isFinite(partCents) || !Number.isFinite(wholeCents) || wholeCents <= 0) return 0;
	return Math.round((partCents / wholeCents) * 100);
}

/**
 * Igual que `pctOf` pero `null` cuando no hay denominador (para ocultar la
 * métrica en vez de mostrar "0%"). Ej.: porcentaje del ingreso cuando no hay
 * ingreso registrado.
 * @param {number} partCents
 * @param {number} wholeCents
 * @returns {number|null}
 */
export function pctOfNullable(partCents, wholeCents) {
	if (!Number.isFinite(partCents) || !Number.isFinite(wholeCents) || wholeCents <= 0) return null;
	return Math.round((partCents / wholeCents) * 100);
}

/**
 * Suma los importes de una lista de entradas. Útil para verificar que el
 * total de una categoría coincide con la suma de sus subcategorías.
 * @param {Array<{ amountCents?: number, totalCents?: number }>} entries
 * @returns {number}
 */
export function sumCents(entries) {
	if (!Array.isArray(entries)) return 0;
	let total = 0;
	for (const e of entries) {
		const value = Number(e?.totalCents ?? e?.amountCents ?? 0);
		if (Number.isFinite(value)) total += value;
	}
	return total;
}
