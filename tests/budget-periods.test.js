import test from 'node:test';
import assert from 'node:assert/strict';

import {
	isValidMonthKey,
	isValidStartDay,
	monthKeyFromDate,
	monthKeyOfDate,
	currentMonthKey,
	getMonthRangeByKey,
	periodEndAfter,
	periodBoundsFromStart,
	isStandardPeriod,
	resolvePeriodForDate,
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

test('Budgets mensuales: claves de mes canónicas', async (t) => {
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

	await t.test('monthKeyFromDate respeta monthStartDay', () => {
		const ref = new Date(Date.UTC(2026, 9, 19)); // 19 de octubre de 2026
		assert.equal(monthKeyFromDate(ref, 1), '2026-10');
		assert.equal(monthKeyFromDate(ref, 15), '2026-10');

		const beforeStart = new Date(Date.UTC(2026, 9, 10)); // 10 de octubre
		assert.equal(monthKeyFromDate(beforeStart, 15), '2026-09');
	});

	await t.test('currentMonthKey acepta una fecha de referencia inyectable', () => {
		const ref = new Date(Date.UTC(2026, 9, 19));
		assert.equal(currentMonthKey(1, ref), '2026-10');
		assert.equal(currentMonthKey(25, new Date(Date.UTC(2026, 9, 10))), '2026-09');
	});

	await t.test('shiftMonthKey cruza fronteras de año en ambos sentidos', () => {
		assert.equal(shiftMonthKey('2026-10', 1), '2026-11');
		assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
		assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
		assert.equal(shiftMonthKey('2026-10', -14), '2025-08');
		assert.equal(previousMonthKey('2026-01'), '2025-12');
		assert.equal(nextMonthKey('2026-12'), '2027-01');
	});

	await t.test('getMonthRangeByKey respeta monthStartDay y da etiqueta', () => {
		const range1 = getMonthRangeByKey('2026-05', 1);
		assert.equal(range1.start.toISOString(), '2026-05-01T00:00:00.000Z');
		assert.equal(range1.end.toISOString(), '2026-06-01T00:00:00.000Z');

		const range15 = getMonthRangeByKey('2026-05', 15);
		assert.equal(range15.start.toISOString(), '2026-05-15T00:00:00.000Z');
		assert.equal(range15.end.toISOString(), '2026-06-15T00:00:00.000Z');

		assert.match(getMonthRangeByKey('2026-05', 1).label, /mayo/i);
		assert.throws(() => getMonthRangeByKey('2026-13', 1), /inválido/i);
	});

	await t.test('los meses son aislados: octubre no comparte rango con septiembre', () => {
		const oct = getMonthRangeByKey('2026-10', 1);
		const sep = getMonthRangeByKey('2026-09', 1);
		assert.equal(sep.end.getTime(), oct.start.getTime());
		assert.notEqual(sep.start.getTime(), oct.start.getTime());
	});

	await t.test('monthKeyLabel devuelve una etiqueta legible', () => {
		assert.match(monthKeyLabel('2026-10'), /octubre/i);
		assert.match(monthKeyLabel('2026-10'), /2026/);
	});
});

test('Budgets mensuales: utilidades de líneas', async (t) => {
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

test('Ciclos con límites explícitos y transición de día de inicio', async (t) => {
	await t.test('isValidStartDay solo admite 1–28', () => {
		for (let day = 1; day <= 28; day++) assert.equal(isValidStartDay(day), true);
		assert.equal(isValidStartDay(0), false);
		assert.equal(isValidStartDay(29), false);
		assert.equal(isValidStartDay(30), false);
		assert.equal(isValidStartDay(31), false);
		assert.equal(isValidStartDay(15.5), false);
		assert.equal(isValidStartDay('15'), false);
	});

	await t.test('monthKeyOfDate usa el mes calendario de la fecha de inicio', () => {
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 0, 15))), '2026-01');
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 11, 1))), '2026-12');
		// Un periodo de transición que inicia el 1 de noviembre pertenece a
		// noviembre, aunque con día 15 la fecha caiga antes del corte.
		assert.equal(monthKeyOfDate(new Date(Date.UTC(2026, 10, 1))), '2026-11');
	});

	await t.test('periodEndAfter cruza año y respeta días cortos', () => {
		assert.equal(
			periodEndAfter(new Date(Date.UTC(2026, 11, 15)), 15).toISOString(),
			'2027-01-15T00:00:00.000Z'
		);
		assert.equal(
			periodEndAfter(new Date(Date.UTC(2026, 0, 28)), 28).toISOString(),
			'2026-02-28T00:00:00.000Z'
		);
		assert.throws(() => periodEndAfter(new Date(Date.UTC(2026, 0, 1)), 31), /inválido/i);
	});

	await t.test('periodBoundsFromStart normaliza la fecha y calcula límites', () => {
		const bounds = periodBoundsFromStart(new Date(Date.UTC(2026, 4, 15, 18, 30)), 15);
		assert.equal(bounds.start.toISOString(), '2026-05-15T00:00:00.000Z');
		assert.equal(bounds.end.toISOString(), '2026-06-15T00:00:00.000Z');
		assert.equal(bounds.monthKey, '2026-05');
	});

	await t.test('isStandardPeriod distingue ciclos normales de transiciones', () => {
		assert.equal(
			isStandardPeriod(new Date(Date.UTC(2026, 9, 15)), new Date(Date.UTC(2026, 10, 15)), 15),
			true
		);
		assert.equal(
			isStandardPeriod(new Date(Date.UTC(2026, 10, 1)), new Date(Date.UTC(2026, 11, 15)), 15),
			false
		);
	});

	await t.test('resolvePeriodForDate usa el fin del último presupuesto si se solapa', () => {
		const reference = new Date(Date.UTC(2026, 10, 1)); // 1 de noviembre de 2026
		const latestEnd = new Date(Date.UTC(2026, 10, 1)); // termina justo el 1 de noviembre
		const transition = resolvePeriodForDate(reference, 15, latestEnd);
		assert.equal(transition.start.toISOString(), '2026-11-01T00:00:00.000Z');
		assert.equal(transition.end.toISOString(), '2026-12-15T00:00:00.000Z');
		assert.equal(transition.monthKey, '2026-11');
		assert.equal(transition.startDay, 15);
		assert.equal(transition.isTransition, true);
	});

	await t.test('resolvePeriodForDate no inventa transición sin solapamiento', () => {
		const reference = new Date(Date.UTC(2026, 9, 19)); // 19 de octubre
		const naive = resolvePeriodForDate(reference, 15, null);
		assert.equal(naive.start.toISOString(), '2026-10-15T00:00:00.000Z');
		assert.equal(naive.end.toISOString(), '2026-11-15T00:00:00.000Z');
		assert.equal(naive.monthKey, '2026-10');
		assert.equal(naive.startDay, 15);
		assert.equal(naive.isTransition, false);

		// Un fin anterior al inicio ingenuo deja un hueco por meses saltados; no
		// se estira el periodo hacia atrás.
		const skipped = resolvePeriodForDate(
			new Date(Date.UTC(2026, 10, 20)),
			15,
			new Date(Date.UTC(2026, 9, 15))
		);
		assert.equal(skipped.start.toISOString(), '2026-11-15T00:00:00.000Z');
		assert.equal(skipped.monthKey, '2026-11');
		assert.equal(skipped.isTransition, false);
	});

	await t.test('formatPeriodLabel muestra fechas reales inclusivas', () => {
		const label = formatPeriodLabel(
			new Date(Date.UTC(2026, 9, 15)),
			new Date(Date.UTC(2026, 10, 15))
		);
		assert.match(label, /15/);
		assert.match(label, /oct/i);
		assert.match(label, /14/);
		assert.match(label, /nov/i);
	});

	await t.test('settingsSchema rechaza días 29–31 y valida incomeType', () => {
		assert.equal(settingsSchema.safeParse({ monthStartDay: '1' }).success, true);
		assert.equal(settingsSchema.safeParse({ monthStartDay: '28' }).success, true);
		assert.equal(settingsSchema.safeParse({ monthStartDay: '29' }).success, false);
		assert.equal(settingsSchema.safeParse({ monthStartDay: '30' }).success, false);
		assert.equal(settingsSchema.safeParse({ monthStartDay: '31' }).success, false);
		assert.equal(
			settingsSchema.safeParse({ monthStartDay: '15', incomeType: 'fixed' }).success,
			true
		);
		assert.equal(
			settingsSchema.safeParse({ monthStartDay: '15', incomeType: 'variable' }).success,
			true
		);
		assert.equal(settingsSchema.safeParse({ monthStartDay: '15', incomeType: '' }).success, true);
		assert.equal(settingsSchema.safeParse({ monthStartDay: '15', incomeType: null }).success, true);
		assert.equal(
			settingsSchema.safeParse({ monthStartDay: '15', incomeType: 'otro' }).success,
			false
		);
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
