import test from 'node:test';
import assert from 'node:assert/strict';

import {
	groupSubcategories,
	flattenSubcategoryMap,
	subcategoryLabelMap
} from '../src/lib/utils/subcategory-catalog.js';

test('Subcategory catalog utilities', async (t) => {
	await t.test('groupSubcategories agrupa fijas y personalizadas por id de categoría', () => {
		const categories = [
			{ id: 'cat-vivienda', categoryKey: 'vivienda' },
			{ id: 'cat-custom', categoryKey: 'custom-123' }
		];
		const staticSubs = [
			{ key: 'renta', name: 'Renta', categoryKey: 'vivienda' },
			{ key: 'hipoteca', name: 'Hipoteca', categoryKey: 'vivienda' }
		];
		const customSubs = [
			{ id: 'sub-1', key: 'custom-abc', name: 'Cocina', categoryId: 'cat-custom' }
		];

		const map = groupSubcategories(categories, staticSubs, customSubs);

		assert.deepEqual(
			map.get('cat-vivienda').map((s) => s.key),
			['renta', 'hipoteca']
		);
		assert.equal(map.get('cat-vivienda')[0].isCustom, false);
		assert.deepEqual(
			map.get('cat-custom').map((s) => s.key),
			['custom-abc']
		);
		assert.equal(map.get('cat-custom')[0].isCustom, true);
		assert.equal(map.get('cat-custom')[0].id, 'sub-1');
	});

	await t.test('groupSubcategories ignora subcategorías de categorías ausentes', () => {
		const map = groupSubcategories(
			[{ id: 'cat-1', categoryKey: 'vivienda' }],
			[{ key: 'renta', name: 'Renta', categoryKey: 'vivienda' }],
			[{ id: 'sub-x', key: 'custom-x', name: 'X', categoryId: 'cat-inexistente' }]
		);

		assert.deepEqual(
			map.get('cat-1').map((s) => s.key),
			['renta']
		);
	});

	await t.test('flattenSubcategoryMap aplana el mapa en una lista', () => {
		const map = new Map([
			['a', [{ key: 'k1', name: 'Uno', categoryId: 'a', isCustom: false }]],
			['b', [{ key: 'k2', name: 'Dos', categoryId: 'b', isCustom: true }]]
		]);
		assert.deepEqual(
			flattenSubcategoryMap(map).map((s) => s.key),
			['k1', 'k2']
		);
	});

	await t.test('subcategoryLabelMap combina etiquetas fijas y personalizadas', () => {
		const map = subcategoryLabelMap(
			[{ key: 'renta', name: 'Renta' }],
			[{ key: 'custom-abc', name: 'Cocina' }]
		);
		assert.equal(map.get('renta'), 'Renta');
		assert.equal(map.get('custom-abc'), 'Cocina');
		assert.equal(map.get('no-existe'), undefined);
	});
});
