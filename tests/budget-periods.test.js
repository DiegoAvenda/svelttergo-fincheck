import test from 'node:test';
import assert from 'node:assert/strict';

import {
	isValidMonthKey,
	monthKeyFromDate,
	currentMonthKey,
	getMonthRangeByKey,
	shiftMonthKey,
	previousMonthKey,
	nextMonthKey,
	monthKeyLabel
} from '../src/lib/utils/periods.js';

import { budgetHasPlanned, cloneBudgetLines } from '../src/lib/utils/budget-math.js';

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
