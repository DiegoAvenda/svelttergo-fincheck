import test from 'node:test';
import assert from 'node:assert/strict';

import {
	pesosToCents,
	centsToPesos,
	formatMoney,
	parseAmountToCents
} from '../src/lib/utils/money.js';

import { normalizeDescription } from '../src/lib/utils/normalize-description.js';

import { normalizeTicketItems, isDiscountLine } from '../src/lib/utils/ticket-items.js';

import {
	getMonthRange,
	getPreviousMonthRange,
	getLastNMonthsRange,
	getPeriodRange,
	getComparisonRange,
	todayInMX,
	formatDayGroup
} from '../src/lib/utils/periods.js';

test('Money utilities', async (t) => {
	await t.test('pesosToCents converts decimal to integer cents correctly', () => {
		assert.equal(pesosToCents(10.5), 1050);
		assert.equal(pesosToCents(0.99), 99);
		assert.equal(pesosToCents(1234.56), 123456);
		assert.equal(pesosToCents(0), 0);
		// Decimal rounding precision
		assert.equal(pesosToCents(19.99), 1999);
	});

	await t.test('centsToPesos converts cents to pesos', () => {
		assert.equal(centsToPesos(1050), 10.5);
		assert.equal(centsToPesos(99), 0.99);
		assert.equal(centsToPesos(123456), 1234.56);
	});

	await t.test('formatMoney formats as MXN currency', () => {
		const formatted = formatMoney(123456);
		// Debe contener $ y 1,234.56
		assert.match(formatted, /1,234\.56/);
		assert.match(formatted, /\$/);
	});

	await t.test('parseAmountToCents parses string inputs cleanly', () => {
		assert.equal(parseAmountToCents('$1,234.56'), 123456);
		assert.equal(parseAmountToCents(' 50.00 '), 5000);
		assert.equal(parseAmountToCents('18.5'), 1850);
		assert.equal(parseAmountToCents('0'), 0);
		assert.equal(parseAmountToCents(''), null);
		assert.equal(parseAmountToCents('abc'), null);
	});
});

test('Description normalization', async (t) => {
	await t.test('converts to lowercase and strips accents', () => {
		assert.equal(normalizeDescription('CAFÉ CON LECHE'), 'cafe con leche');
		assert.equal(normalizeDescription('JABÓN LÍQUIDO'), 'jabon liquido');
	});

	await t.test('preserves important product numbers and measurements', () => {
		assert.equal(normalizeDescription('COCA COLA 600ML NR'), 'coca cola 600ml nr');
		assert.equal(normalizeDescription('AGUA BONAFONT 1.5L'), 'agua bonafont 1.5l');
		assert.equal(normalizeDescription('SABRITAS 45G SAL'), 'sabritas 45g sal');
		assert.equal(normalizeDescription('LECHE LALA 1L DESLACTOSADA'), 'leche lala 1l deslactosada');
	});

	await t.test('removes unnecessary punctuation and multiple spaces', () => {
		assert.equal(normalizeDescription('  GALLETAS... OREO!  '), 'galletas oreo');
		assert.equal(normalizeDescription('PAN BLANCO BIMBO (GRANDE)'), 'pan blanco bimbo grande');
		assert.equal(normalizeDescription('REFRESCO - CHICO / PROMO'), 'refresco chico promo');
	});

	await t.test('handles empty or non-string inputs safely', () => {
		assert.equal(normalizeDescription(''), '');
		assert.equal(normalizeDescription(null), '');
		assert.equal(normalizeDescription(undefined), '');
	});
});

test('Period calculation with Mexico City timezone and start day', async (t) => {
	await t.test('todayInMX returns a valid date in America/Mexico_City', () => {
		const today = todayInMX();
		assert.ok(today instanceof Date);
		assert.ok(!isNaN(today.getTime()));
	});

	await t.test('getMonthRange cubre el mes calendario completo', () => {
		const refDate = new Date(Date.UTC(2026, 4, 15)); // 15 de mayo de 2026
		const range = getMonthRange(refDate);

		assert.equal(range.start.toISOString(), '2026-05-01T00:00:00.000Z');
		assert.equal(range.end.toISOString(), '2026-06-01T00:00:00.000Z');
	});

	await t.test('getMonthRange incluye el último día natural en meses cortos', () => {
		const feb = getMonthRange(new Date(Date.UTC(2028, 1, 10))); // febrero bisiesto
		assert.equal(feb.start.toISOString(), '2028-02-01T00:00:00.000Z');
		assert.equal(feb.end.toISOString(), '2028-03-01T00:00:00.000Z');
		assert.equal(new Date(feb.end.getTime() - 86400000).toISOString(), '2028-02-29T00:00:00.000Z');

		const apr = getMonthRange(new Date(Date.UTC(2026, 3, 30)));
		assert.equal(apr.start.toISOString(), '2026-04-01T00:00:00.000Z');
		assert.equal(apr.end.toISOString(), '2026-05-01T00:00:00.000Z');
	});

	await t.test('getPreviousMonthRange returns immediate prior month range', () => {
		const refDate = new Date(Date.UTC(2026, 4, 15)); // Mayo 2026
		const prev = getPreviousMonthRange(refDate);
		assert.equal(prev.start.toISOString(), '2026-04-01T00:00:00.000Z');
		assert.equal(prev.end.toISOString(), '2026-05-01T00:00:00.000Z');
	});

	await t.test('getLastNMonthsRange returns correct 3-month window', () => {
		const refDate = new Date(Date.UTC(2026, 4, 15)); // Mayo 2026
		const range = getLastNMonthsRange(refDate, 3);
		assert.equal(range.start.toISOString(), '2026-03-01T00:00:00.000Z');
		assert.equal(range.end.toISOString(), '2026-06-01T00:00:00.000Z');
	});

	await t.test('getComparisonRange returns equal duration immediately preceding window', () => {
		const range = {
			start: new Date(Date.UTC(2026, 4, 1)),
			end: new Date(Date.UTC(2026, 5, 1))
		};
		const comp = getComparisonRange(range);
		assert.equal(comp.end.getTime(), range.start.getTime());
		assert.equal(
			comp.end.getTime() - comp.start.getTime(),
			range.end.getTime() - range.start.getTime()
		);
	});

	await t.test('formatDayGroup identifies Hoy, Ayer, or returns formatted date', () => {
		const today = todayInMX();
		assert.equal(formatDayGroup(today), 'Hoy');

		const yesterday = new Date(today.getTime() - 86400000);
		assert.equal(formatDayGroup(yesterday), 'Ayer');
	});
});

test('Ticket discount merging (rebajas no son items)', async (t) => {
	await t.test('fusiona Rebaja con precio final repetido: MARUCHAN 18 + Rebaja 14 => 14', () => {
		const result = normalizeTicketItems([
			{ originalDescription: 'MARUCHAN VA', amount: 18, status: 'identified' },
			{ originalDescription: 'Rebaja 1X$14 -4.00 x 1', amount: 14, status: 'identified' }
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].originalDescription, 'MARUCHAN VA');
		assert.equal(result[0].amount, 14);
	});

	await t.test('fusiona Rebaja con monto negativo', () => {
		const result = normalizeTicketItems([
			{ originalDescription: 'COCA COLA 600ML', amount: 20, status: 'identified' },
			{ originalDescription: 'Descuento', amount: -4, status: 'identified' }
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].amount, 16);
	});

	await t.test('la rebaja duplicada no aumenta el precio del item previo', () => {
		const result = normalizeTicketItems([
			{ originalDescription: 'SABRITAS 45G', amount: 18, status: 'identified' },
			{ originalDescription: 'Rebaja x 1', amount: 18, status: 'identified' }
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].amount, 18);
	});

	await t.test(
		'la rebaja con -4.00 explicito siempre descuenta aunque amount repita el final',
		() => {
			const result = normalizeTicketItems([
				{ originalDescription: 'SABRITAS 45G', amount: 18, status: 'identified' },
				{ originalDescription: 'Rebaja 1X$14 -4.00 x 1', amount: 18, status: 'identified' }
			]);
			assert.equal(result.length, 1);
			assert.equal(result[0].amount, 14);
		}
	);

	await t.test('descarta encabezados y totales aunque la IA los incluya', () => {
		const result = normalizeTicketItems([
			{ originalDescription: 'ABARROTES BASICOS--------', amount: 0, status: 'identified' },
			{ originalDescription: 'MARUCHAN VA', amount: 14, status: 'identified' },
			{ originalDescription: 'ARTICULOS COMPRADOS: 5', amount: 0, status: 'identified' }
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].originalDescription, 'MARUCHAN VA');
	});

	await t.test('isDiscountLine detecta variantes', () => {
		assert.equal(isDiscountLine('Rebaja 1X$14 -4.00 x 1'), true);
		assert.equal(isDiscountLine('Descuento aplicado'), true);
		assert.equal(isDiscountLine('MARUCHAN VA'), false);
	});

	await t.test('preserva itemCode, raw/clean y departamento del nuevo formato IA', () => {
		const result = normalizeTicketItems([
			{
				itemCode: '7506495069520',
				rawDescription: 'PLC AU DES',
				cleanDescription: 'Producto Lácteo Deslactosado Aurrera',
				department: 'LACTEOS',
				amount: 16,
				status: 'identified'
			}
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].itemCode, '7506495069520');
		assert.equal(result[0].rawDescription, 'PLC AU DES');
		assert.equal(result[0].cleanDescription, 'Producto Lácteo Deslactosado Aurrera');
		assert.equal(result[0].originalDescription, 'Producto Lácteo Deslactosado Aurrera');
		assert.equal(result[0].department, 'LACTEOS');
		assert.equal(result[0].status, 'identified');
	});

	await t.test('preserva status ambiguous cuando ni el departamento aclara el producto', () => {
		const result = normalizeTicketItems([
			{
				itemCode: '7506495069520',
				rawDescription: 'PLC AU DES',
				cleanDescription: 'PLC AU DES',
				department: 'LACTEOS',
				amount: 16,
				status: 'ambiguous'
			}
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].status, 'ambiguous');
		assert.equal(result[0].cleanDescription, 'PLC AU DES');
	});

	await t.test('acepta price como alias de amount (compat formato tarea)', () => {
		const result = normalizeTicketItems([
			{
				itemCode: '7506495069520',
				rawDescription: 'PLC AU DES',
				cleanDescription: 'Producto Lácteo Deslactosado Aurrera',
				price: 16.0,
				status: 'identified'
			}
		]);
		assert.equal(result.length, 1);
		assert.equal(result[0].amount, 16);
	});
});
