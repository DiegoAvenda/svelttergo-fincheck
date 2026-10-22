/**
 * Zona horaria de referencia para la app.
 */
export const TIMEZONE = 'America/Mexico_City';

/**
 * Retorna la fecha actual en CDMX como Date (con hora 00:00:00 UTC representando el día local).
 * @returns {Date}
 */
export function todayInMX() {
	const now = new Date();
	const mx = new Date(now.toLocaleDateString('en-CA', { timeZone: TIMEZONE }) + 'T00:00:00Z');
	return mx;
}

/**
 * Retorna el rango de fechas [start, end) del mes calendario de `referenceDate`.
 * El ciclo siempre empieza el día 1 y termina el día 1 del mes siguiente
 * (fin exclusivo), es decir, el último día natural del mes queda incluido.
 * @param {Date} referenceDate - Fecha de referencia (en zona MX)
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getMonthRange(referenceDate) {
	const year = referenceDate.getUTCFullYear();
	const month = referenceDate.getUTCMonth();
	const start = new Date(Date.UTC(year, month, 1));
	const end = new Date(Date.UTC(year, month + 1, 1));

	const label = start.toLocaleDateString('es-MX', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	return { start, end, label };
}

/**
 * Retorna el rango del mes anterior al mes actual.
 * @param {Date} referenceDate
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getPreviousMonthRange(referenceDate) {
	const current = getMonthRange(referenceDate);
	// Retrocedemos un día antes del inicio del mes actual
	const dayBefore = new Date(current.start.getTime() - 86400000);
	return getMonthRange(dayBefore);
}

/**
 * Retorna un rango de N meses hacia atrás.
 * @param {Date} referenceDate
 * @param {number} months - Número de meses
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getLastNMonthsRange(referenceDate, months) {
	const current = getMonthRange(referenceDate);
	let start = current.start;

	for (let i = 1; i < months; i++) {
		const dayBefore = new Date(start.getTime() - 86400000);
		start = getMonthRange(dayBefore).start;
	}

	const label = `Últimos ${months} meses`;
	return { start, end: current.end, label };
}

/**
 * Obtiene el rango de periodo dado un nombre de periodo.
 * @param {'this-month' | 'last-month' | 'last-3-months'} period
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getPeriodRange(period) {
	const today = todayInMX();

	switch (period) {
		case 'last-month':
			return getPreviousMonthRange(today);
		case 'last-3-months':
			return getLastNMonthsRange(today, 3);
		case 'this-month':
		default:
			return getMonthRange(today);
	}
}

/**
 * Valida una clave de mes canónica `YYYY-MM`.
 * @param {string|null|undefined} monthKey
 * @returns {boolean}
 */
export function isValidMonthKey(monthKey) {
	return typeof monthKey === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey);
}

/**
 * Clave del mes actual en CDMX.
 * @param {Date} [referenceDate] - Inyectable para pruebas.
 * @returns {string}
 */
export function currentMonthKey(referenceDate = todayInMX()) {
	return monthKeyOfDate(referenceDate);
}

/**
 * Rango de fechas [start, end) de una clave de mes `YYYY-MM`.
 * @param {string} monthKey
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getMonthRangeByKey(monthKey) {
	if (!isValidMonthKey(monthKey)) {
		throw new Error(`Mes inválido: ${monthKey}`);
	}

	const [year, month] = monthKey.split('-').map(Number);
	const start = new Date(Date.UTC(year, month - 1, 1));
	const end = new Date(Date.UTC(year, month, 1));
	const label = start.toLocaleDateString('es-MX', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	return { start, end, label };
}

/**
 * Clave `YYYY-MM` del mes calendario de una fecha.
 * @param {Date} date
 * @returns {string}
 */
export function monthKeyOfDate(date) {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Etiqueta legible de un periodo con sus fechas reales.
 * @param {Date} start
 * @param {Date} end - Fin exclusivo.
 * @param {{ includeYear?: boolean }} [options]
 * @returns {string}
 */
export function formatPeriodLabel(start, end, options = {}) {
	const { includeYear = true } = options;
	const endInclusive = new Date(end.getTime() - 86400000);
	const sameYear = start.getUTCFullYear() === endInclusive.getUTCFullYear();
	const base = { day: 'numeric', month: 'short', timeZone: 'UTC' };
	const startLabel = start.toLocaleDateString(
		'es-MX',
		sameYear ? base : { ...base, year: 'numeric' }
	);
	const endLabel = endInclusive.toLocaleDateString(
		'es-MX',
		includeYear ? { ...base, year: 'numeric' } : base
	);
	return `${startLabel} – ${endLabel}`;
}

/**
 * Desplaza una clave de mes `YYYY-MM` N meses (positivo o negativo).
 * @param {string} monthKey
 * @param {number} delta
 * @returns {string}
 */
export function shiftMonthKey(monthKey, delta) {
	if (!isValidMonthKey(monthKey)) {
		throw new Error(`Mes inválido: ${monthKey}`);
	}

	const [year, month] = monthKey.split('-').map(Number);
	const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Clave del mes anterior.
 * @param {string} monthKey
 * @returns {string}
 */
export function previousMonthKey(monthKey) {
	return shiftMonthKey(monthKey, -1);
}

/**
 * Clave del mes siguiente.
 * @param {string} monthKey
 * @returns {string}
 */
export function nextMonthKey(monthKey) {
	return shiftMonthKey(monthKey, 1);
}

/**
 * Etiqueta legible de una clave de mes (`octubre de 2026`).
 * @param {string} monthKey
 * @returns {string}
 */
export function monthKeyLabel(monthKey) {
	if (!isValidMonthKey(monthKey)) {
		throw new Error(`Mes inválido: ${monthKey}`);
	}

	const [year, month] = monthKey.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('es-MX', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

/**
 * Retorna el rango de comparación (periodo anterior de igual duración).
 * @param {{ start: Date, end: Date }} range
 * @returns {{ start: Date, end: Date }}
 */
export function getComparisonRange(range) {
	const durationMs = range.end.getTime() - range.start.getTime();
	return {
		start: new Date(range.start.getTime() - durationMs),
		end: new Date(range.start.getTime())
	};
}

/**
 * Formatea una fecha para mostrar en la UI.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
	return date.toLocaleDateString('es-MX', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
}

/**
 * Formatea una fecha con año.
 * @param {Date} date
 * @returns {string}
 */
export function formatDateFull(date) {
	return date.toLocaleDateString('es-MX', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

/**
 * Agrupa fechas por día en formato legible.
 * @param {Date} date
 * @returns {string}
 */
export function formatDayGroup(date) {
	const today = todayInMX();
	const yesterday = new Date(today.getTime() - 86400000);

	const dateStr = date.toISOString().slice(0, 10);
	const todayStr = today.toISOString().slice(0, 10);
	const yesterdayStr = yesterday.toISOString().slice(0, 10);

	if (dateStr === todayStr) return 'Hoy';
	if (dateStr === yesterdayStr) return 'Ayer';

	return date.toLocaleDateString('es-MX', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	});
}
