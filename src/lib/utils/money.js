/**
 * Convierte pesos (número decimal) a centavos (entero).
 * @param {number} pesos
 * @returns {number}
 */
export function pesosToCents(pesos) {
	return Math.round(pesos * 100);
}

/**
 * Convierte centavos (entero) a pesos (número decimal).
 * @param {number} cents
 * @returns {number}
 */
export function centsToPesos(cents) {
	return cents / 100;
}

const formatter = new Intl.NumberFormat('es-MX', {
	style: 'currency',
	currency: 'MXN',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

const formatterNoDecimals = new Intl.NumberFormat('es-MX', {
	style: 'currency',
	currency: 'MXN',
	minimumFractionDigits: 0,
	maximumFractionDigits: 0
});

/**
 * Formatea centavos como moneda MXN.
 * @param {number} cents
 * @param {{ noDecimals?: boolean }} [options]
 * @returns {string}
 */
export function formatMoney(cents, options = {}) {
	const pesos = centsToPesos(cents);
	return options.noDecimals ? formatterNoDecimals.format(pesos) : formatter.format(pesos);
}

/**
 * Parsea un string de importe a centavos. Acepta formatos como "1,234.56" o "1234.56".
 * Retorna null si no es un número válido.
 * @param {string} value
 * @returns {number | null}
 */
export function parseAmountToCents(value) {
	if (!value || typeof value !== 'string') return null;
	// Quitar $ y espacios
	const cleaned = value.replace(/[$\s]/g, '').replace(/,/g, '');
	const num = parseFloat(cleaned);
	if (isNaN(num) || !isFinite(num)) return null;
	return pesosToCents(num);
}
