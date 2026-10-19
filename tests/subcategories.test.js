import test from 'node:test';
import assert from 'node:assert/strict';

import {
	SUBCATEGORIES,
	SYSTEM_SUBCATEGORY_PENDING_KEY,
	allSubcategoryKeys,
	getCategoryKeyOfSubcategory,
	getSubcategoriesOf,
	getSubcategoryByKey,
	isCompatibleCategorySubcategory,
	isValidSubcategoryKey,
	sanitizeSubcategoryKey,
	subcategoryLabel,
	suggestSubcategoryKey
} from '../src/lib/server/defaults/subcategories.js';

import {
	FIXED_CATEGORIES,
	SYSTEM_CATEGORY_KEY,
	getFixedCategoryKeyByName
} from '../src/lib/server/defaults/categories.js';

import { pctOf, pctOfNullable, sumCents } from '../src/lib/utils/spending-math.js';

const FIXED_KEYS = new Set([...FIXED_CATEGORIES.map((c) => c.key), SYSTEM_CATEGORY_KEY]);

test('Catálogo de subcategorías', async (t) => {
	await t.test('cada subcategoría pertenece a una categoría principal válida', () => {
		for (const sub of SUBCATEGORIES) {
			assert.ok(
				FIXED_KEYS.has(sub.categoryKey),
				`${sub.key} apunta a categoría inexistente: ${sub.categoryKey}`
			);
		}
	});

	await t.test('las keys son únicas y estables (sin nombres visibles)', () => {
		const keys = SUBCATEGORIES.map((s) => s.key);
		assert.equal(new Set(keys).size, keys.length);
		for (const key of keys) {
			assert.match(key, /^[a-z0-9-]+$/, `key no estable: ${key}`);
		}
	});

	await t.test('cada categoría fija tiene al menos una subcategoría', () => {
		for (const cat of FIXED_CATEGORIES) {
			assert.ok(
				getSubcategoriesOf(cat.key).length > 0,
				`la categoría ${cat.key} no tiene subcategorías`
			);
		}
	});

	await t.test('la key pendiente no se ofrece como subcategoría asignable', () => {
		assert.ok(!allSubcategoryKeys().includes(SYSTEM_SUBCATEGORY_PENDING_KEY));
	});
});

test('Validación de subcategorías (servidor)', async (t) => {
	await t.test('la IA no puede guardar un identificador inexistente', () => {
		assert.equal(getSubcategoryByKey('no-existe-xyz'), null);
		assert.equal(isValidSubcategoryKey('no-existe-xyz'), false);
		// El saneo convierte cualquier key inválida en pendiente (null).
		assert.equal(sanitizeSubcategoryKey('no-existe-xyz'), null);
	});

	await t.test('rechaza combinaciones incompatibles de categoría y subcategoría', () => {
		assert.equal(isCompatibleCategorySubcategory('snacks-bebidas', 'refrescos'), true);
		assert.equal(isCompatibleCategorySubcategory('despensa', 'refrescos'), false);
		assert.equal(isCompatibleCategorySubcategory('mascotas', 'alimento-premios'), true);
		assert.equal(isCompatibleCategorySubcategory('salud', 'alimento-premios'), false);
	});

	await t.test('una subcategoría deriva siempre su categoría principal', () => {
		assert.equal(getCategoryKeyOfSubcategory('refrescos'), 'snacks-bebidas');
		assert.equal(getCategoryKeyOfSubcategory('alimento-premios'), 'mascotas');
		assert.equal(getCategoryKeyOfSubcategory('no-existe'), null);
	});

	await t.test('los gastos históricos sin subcategoría siguen siendo válidos', () => {
		assert.equal(isCompatibleCategorySubcategory('despensa', null), true);
		assert.equal(isCompatibleCategorySubcategory(null, null), true);
		assert.equal(subcategoryLabel(null), 'Pendiente de revisión');
		assert.equal(subcategoryLabel('refrescos'), 'Refrescos');
	});
});

test('Clasificación conservadora por subcategoría (respaldo)', async (t) => {
	await t.test('variantes de Coca-Cola de distintas tiendas caen en Refrescos', () => {
		assert.equal(suggestSubcategoryKey('COCA COLA 600 ML'), 'refrescos');
		assert.equal(suggestSubcategoryKey('COCA COLA RET 600'), 'refrescos');
		assert.equal(getCategoryKeyOfSubcategory(suggestSubcategoryKey('PEPSI 2L')), 'snacks-bebidas');
	});

	await t.test('clasifica por naturaleza del artículo, no por tienda', () => {
		assert.equal(suggestSubcategoryKey('PAPAS SABRITAS 45G'), 'botanas-saladas');
		assert.equal(suggestSubcategoryKey('ARROZ 1KG'), 'abarrotes-ingredientes');
		assert.equal(suggestSubcategoryKey('DETERGENTE SUAVITEL'), 'productos-limpieza');
		assert.equal(suggestSubcategoryKey('CROQUETAS PARA PERRO'), 'alimento-premios');
		assert.equal(suggestSubcategoryKey('MEDICAMENTO VETERINARIO'), 'medicamentos-veterinarios');
	});

	await t.test('un artículo ilegible no se inventa: queda pendiente', () => {
		assert.equal(suggestSubcategoryKey('???'), null);
		assert.equal(suggestSubcategoryKey('ART VAR'), null);
	});
});

test('Matemáticas de porcentajes del dashboard', async (t) => {
	await t.test('usa el denominador correcto según la métrica', () => {
		// % del gasto total (denominador = gasto).
		assert.equal(pctOf(50000, 100000), 50);
		// % del ingreso (denominador = ingreso).
		assert.equal(pctOfNullable(120000, 1200000), 10);
		// % de la subcategoría dentro de su categoría (denominador = categoría).
		assert.equal(pctOf(50000, 120000), 42);
	});

	await t.test('sin denominador no se muestra un 0% engañoso', () => {
		assert.equal(pctOf(100, 0), 0);
		assert.equal(pctOfNullable(100, 0), null);
	});

	await t.test('el total de la categoría coincide con la suma de sus subcategorías', () => {
		const subs = [
			{ subcategoryKey: 'refrescos', totalCents: 50000 },
			{ subcategoryKey: 'botanas-saladas', totalCents: 70000 }
		];
		const categoryTotal = 120000;
		assert.equal(sumCents(subs), categoryTotal);
	});
});

test('Coherencia catálogo categorías <-> subcategorías', async (t) => {
	await t.test('mapea nombre visible de categoría a su key estable', () => {
		assert.equal(getFixedCategoryKeyByName('Snacks y bebidas'), 'snacks-bebidas');
		assert.equal(getFixedCategoryKeyByName('EDUCACION'), 'educacion');
		assert.equal(getFixedCategoryKeyByName('Sin clasificar'), SYSTEM_CATEGORY_KEY);
		assert.equal(getFixedCategoryKeyByName('No existe'), null);
	});
});
