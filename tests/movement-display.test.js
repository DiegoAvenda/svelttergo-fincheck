import test from 'node:test';
import assert from 'node:assert/strict';

import { movementCategoryLabel } from '../src/lib/utils/movement-display.js';

// Mapa id -> nombre equivalente al que arman las páginas.
const NAMES = new Map([
	['cat-refrescos', 'Snacks y bebidas'],
	['cat-despensa', 'Despensa']
]);

const oid = (id) => ({ toString: () => id });

test('Etiqueta de categoría de un movimiento', async (t) => {
	await t.test('movimiento simple: usa su categoría directa', () => {
		assert.equal(
			movementCategoryLabel({ categoryId: oid('cat-despensa'), items: [] }, NAMES),
			'Despensa'
		);
	});

	await t.test('ticket con una sola categoría entre sus artículos: la muestra', () => {
		assert.equal(
			movementCategoryLabel(
				{
					categoryId: null,
					items: [{ categoryId: oid('cat-refrescos') }, { categoryId: oid('cat-refrescos') }]
				},
				NAMES
			),
			'Snacks y bebidas'
		);
	});

	await t.test('ticket repartido en varias categorías: "Varias categorías"', () => {
		assert.equal(
			movementCategoryLabel(
				{
					categoryId: null,
					items: [{ categoryId: oid('cat-refrescos') }, { categoryId: oid('cat-despensa') }]
				},
				NAMES
			),
			'Varias categorías'
		);
	});

	await t.test('ticket con artículos sin categoría: "Sin clasificar"', () => {
		assert.equal(
			movementCategoryLabel({ categoryId: null, items: [{ categoryId: null }] }, NAMES),
			'Sin clasificar'
		);
	});

	await t.test('sin categoría ni artículos: "Sin categoría"', () => {
		assert.equal(movementCategoryLabel({ categoryId: null, items: [] }, NAMES), 'Sin categoría');
		assert.equal(movementCategoryLabel({ categoryId: null }, NAMES), 'Sin categoría');
	});

	await t.test('categoría desconocida cae a "Sin clasificar"', () => {
		assert.equal(
			movementCategoryLabel({ categoryId: oid('cat-borrada'), items: [] }, NAMES),
			'Sin clasificar'
		);
	});

	await t.test('tolera movimientos nulos', () => {
		assert.equal(movementCategoryLabel(null, NAMES), 'Sin categoría');
	});
});
