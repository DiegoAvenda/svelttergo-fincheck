import test from 'node:test';
import assert from 'node:assert/strict';

import {
	buildCatalogUsageSets,
	categoryHasReferences,
	subcategoryHasReferences
} from '../src/lib/utils/catalog-usage.js';

test('Referencias del catálogo: movimientos, ítems y presupuesto', async (t) => {
	await t.test('separa referencias de movimientos y de presupuesto', () => {
		const usage = buildCatalogUsageSets({
			movementCategoryIds: ['cat-mov'],
			itemCategoryIds: ['cat-item'],
			movementSubcategoryKeys: ['renta'],
			itemSubcategoryKeys: ['luz'],
			budgetCategoryIds: ['cat-budget'],
			budgetSubcategoryKeys: ['internet']
		});

		assert.deepEqual([...usage.categoryIds].sort(), ['cat-item', 'cat-mov']);
		assert.deepEqual([...usage.subcategoryKeys].sort(), ['luz', 'renta']);
		assert.deepEqual([...usage.budgetCategoryIds], ['cat-budget']);
		assert.deepEqual([...usage.budgetSubcategoryKeys], ['internet']);

		// La unión incluye también lo presupuestado.
		assert.deepEqual([...usage.referencedCategoryIds].sort(), [
			'cat-budget',
			'cat-item',
			'cat-mov'
		]);
		assert.deepEqual([...usage.referencedSubcategoryKeys].sort(), ['internet', 'luz', 'renta']);
	});

	await t.test('una categoría usada solo en presupuesto sigue bloqueando el borrado', () => {
		const usage = buildCatalogUsageSets({ budgetCategoryIds: ['custom-1'] });
		assert.equal(usage.categoryIds.has('custom-1'), false);
		assert.equal(categoryHasReferences(usage, 'custom-1'), true);
	});

	await t.test('el borrado del padre considera las subcategorías hijas', () => {
		const usage = buildCatalogUsageSets({ budgetSubcategoryKeys: ['custom-sub-1'] });
		assert.equal(categoryHasReferences(usage, 'custom-parent', []), false);
		assert.equal(categoryHasReferences(usage, 'custom-parent', ['custom-sub-1']), true);
		assert.equal(subcategoryHasReferences(usage, 'custom-sub-1'), true);
		assert.equal(subcategoryHasReferences(usage, 'otra'), false);
	});

	await t.test('ignora valores vacíos y nulos', () => {
		const usage = buildCatalogUsageSets({
			movementCategoryIds: [null, undefined, ''],
			itemCategoryIds: [null],
			movementSubcategoryKeys: [null, ''],
			budgetCategoryIds: [null],
			budgetSubcategoryKeys: [undefined]
		});

		assert.equal(usage.referencedCategoryIds.size, 0);
		assert.equal(usage.referencedSubcategoryKeys.size, 0);
	});

	await t.test('acepta entrada vacía o ausente', () => {
		const usage = buildCatalogUsageSets();
		assert.equal(usage.referencedCategoryIds.size, 0);
		assert.equal(categoryHasReferences(null, 'x'), false);
		assert.equal(subcategoryHasReferences(undefined, 'x'), false);
	});
});
