/**
 * Backfill NO destructivo de subcategorías para datos históricos.
 *
 * Uso:
 *   node scripts/backfill-subcategories.js "mongodb://localhost:27017" finchek
 *   node scripts/backfill-subcategories.js --dry-run
 *
 * Estrategia (explícita y reproducible):
 *  1. Marca de forma explícita `subcategoryKey: null` / `categoryKey: null` en los
 *     movimientos e ítems históricos que no tienen el campo. `null` = "pendiente
 *     de revisión", que la interfaz y las agregaciones ya entienden.
 *  2. Reasigna `subcategoryKey` desde `item_corrections` SOLO cuando la corrección
 *     previa tenía una subcategoría y la categoría del ítem coincide con la
 *     categoría derivada de esa subcategoría. Así NUNCA se mueve gasto entre
 *     categorías ni se altera ningún importe histórico.
 *
 * Idempotente: correrlo varias veces no cambia el resultado.
 * No modifica `amountCents`, `categoryId` ni ningún total.
 */
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const subcatsMod = await import(
	'file://' + resolve(__dirname, '../src/lib/server/defaults/subcategories.js').replace(/\\/g, '/')
);
const catsMod = await import(
	'file://' + resolve(__dirname, '../src/lib/server/defaults/categories.js').replace(/\\/g, '/')
);
const { getCategoryKeyOfSubcategory, sanitizeSubcategoryKey } = subcatsMod;
const { getFixedCategoryKeyByName } = catsMod;

const dryRun = process.argv.includes('--dry-run');
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const uri = positional[0] || process.env.MONGODB_URI || 'mongodb://localhost:27017/';
const dbName = positional[1] || process.env.MONGODB_DATABASE || 'finchek';

const categoryKeyOfId = (categories, id) => {
	const cat = categories.find((c) => c._id.toString() === id?.toString());
	if (!cat) return null;
	return cat.categoryKey || getFixedCategoryKeyByName(cat.name);
};

async function main() {
	const client = new MongoClient(uri);
	await client.connect();
	const db = client.db(dbName);
	console.log(`Conectado a ${dbName}${dryRun ? ' (DRY RUN)' : ''}`);

	const userIds = await db.collection('movements').distinct('userId');
	const stats = { movementsScanned: 0, movementsUpdated: 0, itemsMarked: 0, itemsBackfilled: 0 };

	for (const userId of userIds) {
		const categories = await db.collection('categories').find({ userId }).toArray();
		const corrections = await db
			.collection('item_corrections')
			.find({ userId, subcategoryKey: { $nin: [null, ''] } })
			.toArray();

		// Índice de correcciones: por itemCode y por normalizedDescription.
		const byCode = new Map();
		const byDesc = new Map();
		for (const c of corrections) {
			const clean = sanitizeSubcategoryKey(c.subcategoryKey);
			if (!clean) continue;
			if (c.itemCode) byCode.set(String(c.itemCode), { sub: clean, catId: c.categoryId });
			if (c.normalizedDescription)
				byDesc.set(c.normalizedDescription, { sub: clean, catId: c.categoryId });
		}

		const movements = await db.collection('movements').find({ userId }).toArray();
		for (const m of movements) {
			stats.movementsScanned++;
			let changed = false;
			/** @type {any[]} */
			const items = Array.isArray(m.items) ? [...m.items] : [];

			for (let i = 0; i < items.length; i++) {
				const it = items[i];
				if (it.subcategoryKey === undefined) {
					it.subcategoryKey = null;
					stats.itemsMarked++;
					changed = true;
				}
				if (it.categoryKey === undefined) {
					it.categoryKey = categoryKeyOfId(categories, it.categoryId);
					changed = true;
				}
				if (it.subcategoryKey) continue; // ya clasificado

				// Buscar corrección previa consistente.
				const hit =
					(it.itemCode && byCode.get(String(it.itemCode))) ||
					(it.normalizedDescription && byDesc.get(it.normalizedDescription)) ||
					null;
				if (!hit) continue;

				const derivedKey = getCategoryKeyOfSubcategory(hit.sub);
				const itemCatKey = categoryKeyOfId(categories, it.categoryId);
				// Solo si la categoría del ítem coincide con la derivada (no mover gasto).
				if (derivedKey && itemCatKey && derivedKey === itemCatKey) {
					it.subcategoryKey = hit.sub;
					it.categoryKey = derivedKey;
					stats.itemsBackfilled++;
					changed = true;
				}
			}

			// Movimiento simple (sin ítems): marcar pendiente explícito.
			const movementChanged =
				changed || m.subcategoryKey === undefined || m.categoryKey === undefined;
			if (!movementChanged) continue;

			stats.movementsUpdated++;
			if (dryRun) continue;

			await db.collection('movements').updateOne(
				{ _id: m._id, userId },
				{
					$set: {
						items,
						subcategoryKey: m.subcategoryKey ?? null,
						categoryKey: m.categoryKey ?? categoryKeyOfId(categories, m.categoryId)
					}
				}
			);
		}
	}

	console.log('Backfill de subcategorías completo:', stats);
	await client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
