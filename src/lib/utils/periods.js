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
 * Retorna el rango de fechas [start, end) para un mes dado, usando monthStartDay.
 * Si monthStartDay = 1 (por defecto), el mes va del 1 al 1 del siguiente.
 * Si monthStartDay = 15, el mes va del 15 al 15 del siguiente.
 * @param {Date} referenceDate - Fecha de referencia (en zona MX)
 * @param {number} monthStartDay - Día de inicio del mes (1-28)
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getMonthRange(referenceDate, monthStartDay = 1) {
	const year = referenceDate.getUTCFullYear();
	const month = referenceDate.getUTCMonth();
	const day = referenceDate.getUTCDate();

	let startYear, startMonth;

	if (day >= monthStartDay) {
		startYear = year;
		startMonth = month;
	} else {
		// Estamos antes del inicio del periodo, retrocedemos un mes
		if (month === 0) {
			startYear = year - 1;
			startMonth = 11;
		} else {
			startYear = year;
			startMonth = month - 1;
		}
	}

	const start = new Date(Date.UTC(startYear, startMonth, monthStartDay));

	let endMonth = startMonth + 1;
	let endYear = startYear;
	if (endMonth > 11) {
		endMonth = 0;
		endYear += 1;
	}
	const end = new Date(Date.UTC(endYear, endMonth, monthStartDay));

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
 * @param {number} monthStartDay
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getPreviousMonthRange(referenceDate, monthStartDay = 1) {
	const current = getMonthRange(referenceDate, monthStartDay);
	// Retrocedemos un día antes del inicio del mes actual
	const dayBefore = new Date(current.start.getTime() - 86400000);
	return getMonthRange(dayBefore, monthStartDay);
}

/**
 * Retorna un rango de N meses hacia atrás.
 * @param {Date} referenceDate
 * @param {number} months - Número de meses
 * @param {number} monthStartDay
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getLastNMonthsRange(referenceDate, months, monthStartDay = 1) {
	const current = getMonthRange(referenceDate, monthStartDay);
	let start = current.start;

	for (let i = 1; i < months; i++) {
		const dayBefore = new Date(start.getTime() - 86400000);
		const prev = getMonthRange(dayBefore, monthStartDay);
		start = prev.start;
	}

	const label = `Últimos ${months} meses`;
	return { start, end: current.end, label };
}

/**
 * Obtiene el rango de periodo dado un nombre de periodo.
 * @param {'this-month' | 'last-month' | 'last-3-months'} period
 * @param {number} monthStartDay
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getPeriodRange(period, monthStartDay = 1) {
	const today = todayInMX();

	switch (period) {
		case 'last-month':
			return getPreviousMonthRange(today, monthStartDay);
		case 'last-3-months':
			return getLastNMonthsRange(today, 3, monthStartDay);
		case 'this-month':
		default:
			return getMonthRange(today, monthStartDay);
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
 * Clave canónica `YYYY-MM` del mes contable que contiene `referenceDate`.
 * Respeta `monthStartDay`: si el día es anterior al inicio del mes contable,
 * el mes corresponde al calendario anterior.
 * @param {Date} referenceDate
 * @param {number} [monthStartDay]
 * @returns {string}
 */
export function monthKeyFromDate(referenceDate, monthStartDay = 1) {
	const { start } = getMonthRange(referenceDate, monthStartDay);
	return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Clave del mes contable actual en CDMX.
 * @param {number} [monthStartDay]
 * @param {Date} [referenceDate] - Inyectable para pruebas.
 * @returns {string}
 */
export function currentMonthKey(monthStartDay = 1, referenceDate = todayInMX()) {
	return monthKeyFromDate(referenceDate, monthStartDay);
}

/**
 * Rango de fechas [start, end) de una clave de mes contable `YYYY-MM`.
 * @param {string} monthKey
 * @param {number} [monthStartDay]
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function getMonthRangeByKey(monthKey, monthStartDay = 1) {
	if (!isValidMonthKey(monthKey)) {
		throw new Error(`Mes inválido: ${monthKey}`);
	}

	const [year, month] = monthKey.split('-').map(Number);
	const start = new Date(Date.UTC(year, month - 1, monthStartDay));
	const end = new Date(Date.UTC(year, month, monthStartDay));
	const label = start.toLocaleDateString('es-MX', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	return { start, end, label };
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
