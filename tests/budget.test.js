import test from 'node:test';
import assert from 'node:assert/strict';

import {
	sumPlannedCents,
	sumSpentCents,
	remainingFromIncome,
	budgetUsedPct,
	lineProgressPct,
	plannedCentsByCategory,
	plannedCategoryCount,
	buildBudgetLinesFromForm
} from '../src/lib/utils/budget-math.js';

test('Budget math utilities', async (t) => {
	await t.test('sumPlannedCents suma montos planeados y tolera vacíos', () => {
		assert.equal(sumPlannedCents([{ plannedCents: 1000 }, { plannedCents: 2500 }]), 3500);
		assert.equal(sumPlannedCents([]), 0);
		assert.equal(sumPlannedCents(undefined), 0);
		assert.equal(sumPlannedCents([{ plannedCents: 1000 }, {}]), 1000);
	});

	await t.test('sumSpentCents suma el gasto real de las líneas', () => {
		assert.equal(sumSpentCents([{ spentCents: 500 }, { spentCents: 1500 }]), 2000);
		assert.equal(sumSpentCents(null), 0);
	});

	await t.test('remainingFromIncome calcula lo que sobra del ingreso', () => {
		assert.equal(remainingFromIncome(2000000, 1500000), 500000);
		assert.equal(remainingFromIncome(1000000, 1200000), -200000);
		assert.equal(remainingFromIncome(0, 500), -500);
	});

	await t.test('remainingFromIncome retorna null sin ingreso de referencia', () => {
		assert.equal(remainingFromIncome(null, 500), null);
		assert.equal(remainingFromIncome(undefined, 500), null);
	});

	await t.test('budgetUsedPct calcula el porcentaje del ingreso comprometido', () => {
		assert.equal(budgetUsedPct(5000, 10000), 50);
		assert.equal(budgetUsedPct(12000, 10000), 120);
		assert.equal(budgetUsedPct(0, 10000), 0);
	});

	await t.test('budgetUsedPct retorna null sin ingreso válido', () => {
		assert.equal(budgetUsedPct(5000, null), null);
		assert.equal(budgetUsedPct(5000, 0), null);
		assert.equal(budgetUsedPct(5000, undefined), null);
	});

	await t.test('lineProgressPct evita división por cero', () => {
		assert.equal(lineProgressPct(500, 1000), 50);
		assert.equal(lineProgressPct(1500, 1000), 150);
		assert.equal(lineProgressPct(500, 0), 0);
		assert.equal(lineProgressPct(0, 0), 0);
	});

	await t.test('plannedCentsByCategory suma por categoría (categoría + subcategorías)', () => {
		const map = plannedCentsByCategory([
			{ categoryId: 'cat1', subcategoryKey: null, plannedCents: 100000 },
			{ categoryId: 'cat1', subcategoryKey: 'renta', plannedCents: 50000 },
			{ categoryId: 'cat2', subcategoryKey: 'gasolina', plannedCents: 20000 }
		]);
		assert.equal(map.get('cat1'), 150000);
		assert.equal(map.get('cat2'), 20000);

		// Tolera ObjectId-like (usa toString) y entradas vacías.
		const oid = { toString: () => 'cat9' };
		const map2 = plannedCentsByCategory([{ categoryId: oid, plannedCents: 700 }]);
		assert.equal(map2.get('cat9'), 700);
		assert.equal(plannedCentsByCategory(undefined).size, 0);
	});

	await t.test('plannedCategoryCount cuenta categorías con monto > 0', () => {
		const lines = [
			{ categoryId: 'a', plannedCents: 0 },
			{ categoryId: 'a', plannedCents: 0 },
			{ categoryId: 'b', plannedCents: 500 },
			{ categoryId: 'c', plannedCents: 100 },
			{ categoryId: 'c', plannedCents: 0 }
		];
		assert.equal(plannedCategoryCount(lines), 2);
		assert.equal(plannedCategoryCount([]), 0);
	});

	await t.test('plannedCentsByCategory agrupa también por customKey', () => {
		const map = plannedCentsByCategory([
			{ categoryId: null, customKey: 'renta', plannedCents: 300000 },
			{ categoryId: null, customKey: 'renta', plannedCents: 0 },
			{ categoryId: null, customKey: 'colegiatura', plannedCents: 150000 }
		]);
		assert.equal(map.get('renta'), 300000);
		assert.equal(map.get('colegiatura'), 150000);
		assert.equal(plannedCategoryCount([{ customKey: 'x', plannedCents: 100 }]), 1);
	});
});

test('Parseo del formulario del presupuesto', async (t) => {
	await t.test('construye líneas de categoría y subcategoría', () => {
		const { lines, hasErrors } = buildBudgetLinesFromForm([
			['general|cat1', '1000'],
			['sub|cat1|renta', '500'],
			['sub|cat1|hipoteca', ''],
			['monthlyIncome', '18000']
		]);
		assert.equal(hasErrors, false);
		assert.deepEqual(lines, [
			{ categoryId: 'cat1', subcategoryKey: null, plannedCents: 100000 },
			{ categoryId: 'cat1', subcategoryKey: 'renta', plannedCents: 50000 }
		]);
	});

	await t.test('incluye la categoría aunque el monto general esté vacío', () => {
		const { lines } = buildBudgetLinesFromForm([['general|cat1', '']]);
		assert.deepEqual(lines, [{ categoryId: 'cat1', subcategoryKey: null, plannedCents: 0 }]);
	});

	await t.test('omite subcategorías vacías o en 0', () => {
		const { lines } = buildBudgetLinesFromForm([
			['general|cat1', '0'],
			['sub|cat1|renta', '0'],
			['sub|cat1|hipoteca', '']
		]);
		assert.deepEqual(lines, [{ categoryId: 'cat1', subcategoryKey: null, plannedCents: 0 }]);
	});

	await t.test('ignora subcategorías de categorías no incluidas', () => {
		const { lines } = buildBudgetLinesFromForm([['sub|catX|renta', '500']]);
		assert.deepEqual(lines, []);
	});

	await t.test('reporta importes inválidos', () => {
		const { hasErrors } = buildBudgetLinesFromForm([['general|cat1', 'abc']]);
		assert.equal(hasErrors, true);
	});

	await t.test('filtra categorías y subcategorías no válidas', () => {
		const { lines } = buildBudgetLinesFromForm(
			[
				['general|cat1', '100'],
				['general|cat2', '200'],
				['sub|cat1|inventada', '50']
			],
			{
				isValidCategory: (id) => id === 'cat1' || id === 'cat2',
				isValidSubcategory: (_id, subKey) => subKey === 'renta'
			}
		);
		assert.deepEqual(lines, [
			{ categoryId: 'cat1', subcategoryKey: null, plannedCents: 10000 },
			{ categoryId: 'cat2', subcategoryKey: null, plannedCents: 20000 }
		]);
	});

	await t.test('construye categorías personalizadas con nombre y monto', () => {
		const { lines, hasErrors } = buildBudgetLinesFromForm([
			['general|cat1', '1000'],
			['customName|c1', 'Renta'],
			['custom|c1', '8500'],
			['customName|c2', 'Colegiatura']
		]);
		assert.equal(hasErrors, false);
		assert.deepEqual(lines, [
			{ categoryId: 'cat1', subcategoryKey: null, plannedCents: 100000 },
			{
				categoryId: null,
				customKey: 'c1',
				customName: 'Renta',
				subcategoryKey: null,
				plannedCents: 850000
			},
			{
				categoryId: null,
				customKey: 'c2',
				customName: 'Colegiatura',
				subcategoryKey: null,
				plannedCents: 0
			}
		]);
	});

	await t.test('ignora categorías personalizadas sin nombre y reporta monto inválido', () => {
		const { lines, hasErrors } = buildBudgetLinesFromForm([
			['customName|c1', '   '],
			['custom|c1', '500'],
			['customName|c2', 'Gym'],
			['custom|c2', 'abc']
		]);
		assert.equal(hasErrors, true);
		assert.deepEqual(lines, [
			{
				categoryId: null,
				customKey: 'c2',
				customName: 'Gym',
				subcategoryKey: null,
				plannedCents: 0
			}
		]);
	});

	await t.test('recorta el nombre de la categoría personalizada', () => {
		const { lines } = buildBudgetLinesFromForm([['customName|c1', 'x'.repeat(80)]], {
			maxCustomNameLength: 60
		});
		assert.equal(lines[0].customName.length, 60);
	});
});
