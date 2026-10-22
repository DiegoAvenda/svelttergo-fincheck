import test from 'node:test';
import assert from 'node:assert/strict';

import {
	isValidMonthKey,
	monthKeyOfDate,
	currentMonthKey,
	getMonthRange,
	getMonthRangeByKey,
	formatPeriodLabel,
	shiftMonthKey,
	previousMonthKey,
	nextMonthKey,
	monthKeyLabel
} from '../src/lib/utils/periods.js';

import {
	budgetHasPlanned,
	cloneBudgetLines,
	filterVisibleBudgetLines
} from '../src/lib/utils/budget-math.js';

import { settingsSchema } from '../src/lib/validation/schemas.js';

test('Ciclos mensuales: claves de mes canónicas', async (t) => {
	await t.test('isValidMonthKey acepta YYYY-MM y rechaza el resto', () => {
		assert.equal(isValidMonthKey('2026-10'), true);
		assert.equal(isValidMonthKey('2026-01'), true);
		assert.equal(isValidMonthKey('2026-12'), true);
		assert.equal(isValidMonthKey('2026-13'), false);
		assert.equal(isValidMonthKey('2026-00'), false);
		assert.equal(isValidMonthKey('2026-1'), false);
		assert.equal(isValidMonthKey('legacy-abc'), false);
		assert.equal(isValidMonthKey(''), false);
		assert.equal(isValidMonthKey(null), false);
		assert.equal(isValidMonthKey(undefined), false);
	});

	await t.test('monthKeyOfDate usa siempre el mes calendario de la fecha', () => {
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 9, 19))), '2026-10');
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 9, 1))), '2026-10');
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 9, 31))), '2026-10');
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 11, 31))), '2026-12');
	});

	await t.test('currentMonthKey acepta una fecha de referencia inyectable', () => {
		assert.equal(currentMonthKey(new Date(Date.UTC(2026, 9, 19))), '2026-10');
		assert.equal(currentMonthKey(new Date(Date.UTC(2026, 9, 1))), '2026-10');
		assert.equal(currentMonthKey(new Date(Date.UTC(2027, 0, 1))), '2027-01');
	});

	await t.test('shiftMonthKey cruza fronteras de año en ambos sentidos', () => {
		assert.equal(shiftMonthKey('2026-10', 1), '2026-11');
		assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
		assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
		assert.equal(shiftMonthKey('2026-10', -14), '2025-08');
		assert.equal(previousMonthKey('2026-01'), '2025-12');
		assert.equal(nextMonthKey('2026-12'), '2027-01');
	});

	await t.test('el ciclo va del día 1 al último día natural del mes', () => {
		const range = getMonthRangeByKey('2026-05');
		assert.equal(range.start.toISOString(), '2026-05-01T00:00:00.000Z');
		assert.equal(range.end.toISOString(), '2026-06-01T00:00:00.000Z');
		assert.equal(
			new Date(range.end.getTime() - 86400000).toISOString(),
			'2026-05-31T00:00:00.000Z'
		);

		// Febrero bisiesto y meses de 30 días no necesitan configuración extra.
		const feb = getMonthRangeByKey('2028-02');
		assert.equal(new Date(feb.end.getTime() - 86400000).toISOString(), '2028-02-29T00:00:00.000Z');
		const apr = getMonthRangeByKey('2026-04');
		assert.equal(new Date(apr.end.getTime() - 86400000).toISOString(), '2026-04-30T00:00:00.000Z');

		assert.match(range.label, /mayo/i);
		assert.throws(() => getMonthRangeByKey('2026-13'), /inválido/i);
	});

	await t.test('getMonthRange coincide con la clave del mes', () => {
		const ref = new Date(Date.UTC(2026, 9, 19));
		const range = getMonthRange(ref);
		assert.equal(monthKeyOfDate(range.start), '2026-10');
		assert.equal(getMonthRangeByKey('2026-10').start.getTime(), range.start.getTime());
	});

	await t.test('los meses son aislados: octubre no comparte rango con septiembre', () => {
		const oct = getMonthRangeByKey('2026-10');
		const sep = getMonthRangeByKey('2026-09');
		assert.equal(sep.end.getTime(), oct.start.getTime());
		assert.notEqual(sep.start.getTime(), oct.start.getTime());
	});

	await t.test('monthKeyLabel devuelve una etiqueta legible', () => {
		assert.match(monthKeyLabel('2026-10'), /octubre/i);
		assert.match(monthKeyLabel('2026-10'), /2026/);
	});
});

test('Ciclos mensuales: utilidades de líneas', async (t) => {
	await t.test('budgetHasPlanned ignora ceros pero cuenta líneas ocultas conservadas', () => {
		assert.equal(budgetHasPlanned([{ plannedCents: 0 }, { plannedCents: 0 }]), false);
		assert.equal(
			budgetHasPlanned([{ plannedCents: 0 }, { plannedCents: 100, isHidden: true }]),
			true
		);
		assert.equal(budgetHasPlanned([]), false);
		assert.equal(budgetHasPlanned(null), false);
	});

	await t.test('cloneBudgetLines copia sin mutar el origen ni compartir objetos', () => {
		const categoryId = { toString: () => 'abc' };
		const source = [
			{
				categoryId,
				subcategoryKey: 'renta',
				plannedCents: 150000,
				categoryName: 'Vivienda',
				subcategoryName: 'Renta'
			}
		];
		const copy = cloneBudgetLines(source);

		assert.equal(copy.length, 1);
		assert.equal(copy[0].categoryId, categoryId);
		assert.equal(copy[0].plannedCents, 150000);
		assert.equal(copy[0].subcategoryKey, 'renta');
		assert.notEqual(copy[0], source[0]);

		copy[0].plannedCents = 999;
		assert.equal(source[0].plannedCents, 150000);
	});

	await t.test('cloneBudgetLines normaliza montos y campos faltantes', () => {
		const copy = cloneBudgetLines([{ categoryId: null, subcategoryKey: null }]);
		assert.equal(copy[0].plannedCents, 0);
		assert.deepEqual(Object.keys(copy[0]).sort(), ['categoryId', 'plannedCents', 'subcategoryKey']);
	});
});

test('Ciclos mensuales: etiquetas y configuración', async (t) => {
	await t.test('formatPeriodLabel muestra fechas reales inclusivas', () => {
		const label = formatPeriodLabel(
			new Date(Date.UTC(2026, 9, 1)),
			new Date(Date.UTC(2026, 10, 1))
		);
		assert.match(label, /1/);
		assert.match(label, /oct/i);
		assert.match(label, /31/);
		assert.match(label, /oct/i);
	});

	await t.test('settingsSchema ya no acepta día de inicio de ciclo', () => {
		const parsed = settingsSchema.safeParse({ monthStartDay: '15' });
		assert.equal(parsed.success, true);
		assert.equal(parsed.success && 'monthStartDay' in parsed.data, false);
	});

	await t.test('settingsSchema valida incomeType', () => {
		assert.equal(settingsSchema.safeParse({ incomeType: 'fixed' }).success, true);
		assert.equal(settingsSchema.safeParse({ incomeType: 'variable' }).success, true);
		assert.equal(settingsSchema.safeParse({ incomeType: '' }).success, true);
		assert.equal(settingsSchema.safeParse({ incomeType: null }).success, true);
		assert.equal(settingsSchema.safeParse({ incomeType: 'otro' }).success, false);
	});

	await t.test('filterVisibleBudgetLines omite categorías y subcategorías ocultas', () => {
		const lines = [
			{ categoryId: 'a', subcategoryKey: null },
			{ categoryId: 'b', subcategoryKey: null },
			{ categoryId: 'a', subcategoryKey: 's1' },
			{ categoryId: 'a', subcategoryKey: 's2' }
		];
		const visible = filterVisibleBudgetLines(lines, {
			isCategoryVisible: (id) => id !== 'b',
			isSubcategoryVisible: (_id, key) => key !== 's2'
		});
		assert.deepEqual(
			visible.map((line) => `${line.categoryId}|${line.subcategoryKey ?? ''}`),
			['a|', 'a|s1']
		);
	});
});
