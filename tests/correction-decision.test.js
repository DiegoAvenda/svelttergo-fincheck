import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPersistCorrection } from '../src/lib/server/tickets/correction-decision.js';

/**
 * Regresión: antes se comparaba el texto crudo del ticket contra la descripción
 * limpia de la IA, por lo que TODOS los ítems expandidos/limpiados se guardaban
 * como corrección aunque el usuario no tocara nada.
 */
test('Aprendizaje por corrección de ítems de ticket', async (t) => {
	await t.test('la IA resolvió sola y el usuario no tocó nada: no se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-1',
				originalCategoryId: 'cat-1',
				subcategoryKey: 'refrescos',
				originalSubcategoryKey: 'refrescos',
				description: 'Leche Alpura Deslactosada',
				originalDescription: 'Leche Alpura Deslactosada'
			}),
			false
		);
	});

	await t.test('el texto crudo del ticket no cuenta como edición de descripción', () => {
		// raw "PLC AU DES" fue expandido por la IA; el usuario dejó la descripción igual.
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-1',
				originalCategoryId: 'cat-1',
				subcategoryKey: 'leche-lacteos',
				originalSubcategoryKey: 'leche-lacteos',
				description: 'Leche Alpura Deslactosada',
				originalDescription: 'Leche Alpura Deslactosada'
			}),
			false
		);
	});

	await t.test('el usuario aclaró un ítem ambiguo: se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'ambiguous',
				categoryId: 'cat-1',
				originalCategoryId: '',
				subcategoryKey: 'refrescos',
				originalSubcategoryKey: '',
				description: 'ART VAR',
				originalDescription: 'ART VAR'
			}),
			true
		);
	});

	await t.test('el usuario resolvió un ítem pendiente: se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'pending',
				categoryId: 'cat-2',
				originalCategoryId: '',
				subcategoryKey: 'botanas-saladas',
				originalSubcategoryKey: '',
				description: 'PAPAS',
				originalDescription: 'PAPAS'
			}),
			true
		);
	});

	await t.test('el usuario editó la descripción: se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-1',
				originalCategoryId: 'cat-1',
				subcategoryKey: 'refrescos',
				originalSubcategoryKey: 'refrescos',
				description: 'Coca-Cola de 600 ml',
				originalDescription: 'Refresco cola'
			}),
			true
		);
	});

	await t.test('el usuario cambió la categoría: se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-2',
				originalCategoryId: 'cat-1',
				subcategoryKey: '',
				originalSubcategoryKey: '',
				description: 'Refresco',
				originalDescription: 'Refresco'
			}),
			true
		);
	});

	await t.test('el usuario cambió la subcategoría: se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-1',
				originalCategoryId: 'cat-1',
				subcategoryKey: 'botanas-saladas',
				originalSubcategoryKey: 'refrescos',
				description: 'Refresco',
				originalDescription: 'Refresco'
			}),
			true
		);
	});

	await t.test('sin categoría resuelta nunca se memoriza', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'pending',
				categoryId: '',
				originalCategoryId: '',
				subcategoryKey: '',
				originalSubcategoryKey: '',
				description: 'ILEGIBLE',
				originalDescription: 'ILEGIBLE'
			}),
			false
		);
	});

	await t.test('sin descripción original disponible no hay falso positivo', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-1',
				originalCategoryId: 'cat-1',
				subcategoryKey: 'refrescos',
				originalSubcategoryKey: 'refrescos',
				description: 'Refresco cola',
				originalDescription: ''
			}),
			false
		);
	});

	await t.test('la comparación de descripción ignora acentos/espacios/Mayúsculas', () => {
		assert.equal(
			shouldPersistCorrection({
				status: 'identified',
				categoryId: 'cat-1',
				originalCategoryId: 'cat-1',
				subcategoryKey: 'refrescos',
				originalSubcategoryKey: 'refrescos',
				description: '  CAFÉ   con LECHE ',
				originalDescription: 'Cafe con leche'
			}),
			false
		);
	});
});
