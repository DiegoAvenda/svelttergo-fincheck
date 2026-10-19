/**
 * Limpieza NO destructiva de los metadatos muertos en `movements.items[]`.
 *
 * Contexto: antes se persistía el objeto completo del pipeline de escaneo
 * (itemCode, rawDescription, cleanDescription, normalizedDescription,
 * department, status, categoryKey) en cada artículo del ticket. La app nunca
 * lee esos campos del movimiento: solo usa `originalDescription`,
 * `amountCents`, `categoryId` y `subcategoryKey` (ver `spending-by-category`,
 * `category-detail`, buscador y detalle del movimiento). Los metadatos para
 * reconocer artículos ambiguos viven en `item_corrections`.
 *
 * Uso:
 *   node scripts/trim-movement-items.js "mongodb://localhost:27017" finchek
 *   node scripts/trim-movement-items.js --apply
 *
 * Seguridad:
 *  - Por defecto corre en DRY RUN (no escribe nada). Requiere `--apply` para aplicar.
 *  - SOLO hace `$unset` de los campos listados en `DEAD_FIELDS`.
 *  - NUNCA toca `amountCents`, `categoryId` ni `subcategoryKey`, por lo que
 *    ningún total histórico cambia.
 *  - Idempotente: correrlo varias veces da el mismo resultado.
 */
import { MongoClient } from 'mongodb';

const DEAD_FIELDS = [
	'itemCode',
	'rawDescription',
	'cleanDescription',
	'normalizedDescription',
	'department',
	'status',
	'categoryKey'
];

const apply = process.argv.includes('--apply');
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const uri = positional[0] || process.env.MONGODB_URI || 'mongodb://localhost:27017/';
const dbName = positional[1] || process.env.MONGODB_DATABASE || 'finchek';

async function main() {
	const client = new MongoClient(uri);
	await client.connect();
	const db = client.db(dbName);
	const movements = db.collection('movements');
	console.log(`Conectado a ${dbName}${apply ? '' : ' (DRY RUN, usa --apply para escribir)'}`);

	// Documentos que aún tienen al menos uno de los campos muertos en algún artículo.
	const filter = { $or: DEAD_FIELDS.map((f) => ({ [`items.${f}`]: { $exists: true } })) };
	const matched = await movements.countDocuments(filter);
	console.log(`Movimientos con metadatos muertos en items: ${matched}`);

	if (matched === 0) {
		console.log('Nada que limpiar.');
		await client.close();
		return;
	}

	if (!apply) {
		console.log('DRY RUN: no se modificó nada. Reejecuta con --apply para limpiar.');
		await client.close();
		return;
	}

	const unset = Object.fromEntries(DEAD_FIELDS.map((f) => [`items.$[].${f}`, '']));
	const result = await movements.updateMany(filter, { $unset: unset });
	console.log(`Limpieza completa: ${result.modifiedCount} movimientos modificados.`);
	await client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
