/**
 * Migración al catálogo fijo de 18 categorías (2026-10-18).
 * Uso: node scripts/migrate-to-fixed-categories.js "mongodb://localhost:27017" finchek
 *
 * Qué hace por cada userId en `categories`:
 * 1. Asegura la categoría de sistema "Sin clasificar".
 * 2. Crea las 17 categorías fijas que falten (Vivienda, Servicios, Despensa,
 *    Restaurantes y delivery, Snacks y bebidas, Transporte, Salud, Educación,
 *    Hogar, Ropa y cuidado personal, Entretenimiento y suscripciones,
 *    Familia e hijos, Mascotas, Viajes y vacaciones, Deudas,
 *    Comisiones e impuestos, Regalos y donativos).
 * 3. Reasigna movimientos e ítems de categorías legacy (Comida, Supermercado,
 *    Bebidas, Refrescos, Café, Agua, Snacks y botanas, Otros, etc.) a la fija
 *    equivalente (Despensa / Snacks y bebidas / Restaurantes y delivery /
 *    Ropa y cuidado personal / Entretenimiento y suscripciones / Sin clasificar).
 * 4. Reasigna item_corrections con el mismo mapeo.
 *    (classification_memory se eliminó: el historial vive en movements.items
 *    y las correcciones solo en item_corrections.)
 * 5. Elimina las categorías legacy que queden sin movimientos.
 *
 * Idempotente: se puede correr varias veces sin daño.
 */
import { MongoClient, ObjectId } from 'mongodb';

const FIXED = [
	'Vivienda',
	'Servicios',
	'Despensa',
	'Restaurantes y delivery',
	'Snacks y bebidas',
	'Transporte',
	'Salud',
	'Educación',
	'Hogar',
	'Ropa y cuidado personal',
	'Entretenimiento y suscripciones',
	'Familia e hijos',
	'Mascotas',
	'Viajes y vacaciones',
	'Deudas',
	'Comisiones e impuestos',
	'Regalos y donativos'
];

const SYSTEM = 'Sin clasificar';

// key estable por nombre (para enlazar con subcategorías). Debe coincidir con
// src/lib/server/defaults/categories.js.
const CATEGORY_KEY_BY_NAME = {
	Vivienda: 'vivienda',
	Servicios: 'servicios',
	Despensa: 'despensa',
	'Restaurantes y delivery': 'restaurantes-delivery',
	'Snacks y bebidas': 'snacks-bebidas',
	Transporte: 'transporte',
	Salud: 'salud',
	Educación: 'educacion',
	Hogar: 'hogar',
	'Ropa y cuidado personal': 'ropa-cuidado-personal',
	'Entretenimiento y suscripciones': 'entretenimiento-suscripciones',
	'Familia e hijos': 'familia-hijos',
	Mascotas: 'mascotas',
	'Viajes y vacaciones': 'viajes-vacaciones',
	Deudas: 'deudas',
	'Comisiones e impuestos': 'comisiones-impuestos',
	'Regalos y donativos': 'regalos-donativos',
	'Sin clasificar': 'sin-clasificar'
};

// Legacy (minúsculas, sin acentos) -> fija equivalente.
const LEGACY_MAP = {
	comida: 'Despensa',
	supermercado: 'Despensa',
	'comida preparada': 'Restaurantes y delivery',
	restaurantes: 'Restaurantes y delivery',
	delivery: 'Restaurantes y delivery',
	bebidas: 'Snacks y bebidas',
	refrescos: 'Snacks y bebidas',
	cafe: 'Snacks y bebidas',
	agua: 'Snacks y bebidas',
	'otras bebidas': 'Snacks y bebidas',
	'snacks y botanas': 'Snacks y bebidas',
	papas: 'Snacks y bebidas',
	dulces: 'Snacks y bebidas',
	chocolates: 'Snacks y bebidas',
	antojos: 'Snacks y bebidas',
	hogar: 'Hogar',
	'cuidado personal': 'Ropa y cuidado personal',
	salud: 'Salud',
	entretenimiento: 'Entretenimiento y suscripciones',
	vivienda: 'Vivienda',
	transporte: 'Transporte',
	'transporte publico': 'Transporte',
	gasolina: 'Transporte',
	taxis: 'Transporte',
	'viajes en aplicaciones': 'Transporte',
	otros: 'Sin clasificar'
};

const norm = (s) =>
	(s || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim();

async function main() {
	const uri = process.argv[2] || process.env.MONGODB_URI || 'mongodb://localhost:27017/';
	const dbName = process.argv[3] || process.env.MONGODB_DATABASE || 'finchek';
	const client = new MongoClient(uri);
	await client.connect();
	const db = client.db(dbName);
	console.log(`Conectado a ${dbName}. Migrando al catálogo fijo...`);

	const userIds = await db.collection('categories').distinct('userId');
	console.log(`Usuarios con categorías: ${userIds.length}`);

	let stats = { created: 0, reassigned: 0, removed: 0 };

	for (const userId of userIds) {
		const cats = await db.collection('categories').find({ userId }).toArray();
		const byNorm = new Map(cats.map((c) => [norm(c.name), c]));

		// 1-2. Asegurar sistema + fijas.
		for (const name of [SYSTEM, ...FIXED]) {
			const existing = byNorm.get(norm(name));
			if (!existing) {
				const res = await db.collection('categories').insertOne({
					userId,
					name,
					categoryKey: CATEGORY_KEY_BY_NAME[name] || null,
					parentId: null,
					isFavorite: false,
					isHidden: false,
					isSystem: name === SYSTEM,
					createdAt: new Date()
				});
				byNorm.set(norm(name), { _id: res.insertedId, name });
				stats.created++;
			} else if (!existing.categoryKey && CATEGORY_KEY_BY_NAME[name]) {
				await db
					.collection('categories')
					.updateOne({ _id: existing._id }, { $set: { categoryKey: CATEGORY_KEY_BY_NAME[name] } });
				existing.categoryKey = CATEGORY_KEY_BY_NAME[name];
			}
		}

		// Resolver IDs de destino.
		const targetIdOf = (legacyNorm) => {
			const fixedName = LEGACY_MAP[legacyNorm] || 'Sin clasificar';
			return byNorm.get(norm(fixedName))._id;
		};

		// 3. Reasignar movimientos e ítems legacy.
		for (const cat of cats) {
			const n = norm(cat.name);
			if (cat.isSystem) continue;
			if (FIXED.some((f) => norm(f) === n)) continue; // ya es fija
			const targetId = targetIdOf(n);
			if (targetId.equals(cat._id)) continue;

			const m1 = await db
				.collection('movements')
				.updateMany({ userId, categoryId: cat._id }, { $set: { categoryId: targetId } });
			const m2 = await db
				.collection('movements')
				.updateMany(
					{ userId, 'items.categoryId': cat._id },
					{ $set: { 'items.$[el].categoryId': targetId } },
					{ arrayFilters: [{ 'el.categoryId': cat._id }] }
				);
			const m3 = await db
				.collection('item_corrections')
				.updateMany({ userId, categoryId: cat._id }, { $set: { categoryId: targetId } });
			stats.reassigned += m1.modifiedCount + m2.modifiedCount + m3.modifiedCount;

			// 5. Eliminar la legacy si ya no tiene movimientos.
			const remaining = await db.collection('movements').countDocuments({
				userId,
				$or: [{ categoryId: cat._id }, { 'items.categoryId': cat._id }]
			});
			if (remaining === 0) {
				// Solo borrar no-sistema (las de sistema legacy tipo "Otros" sí se borran).
				await db.collection('categories').deleteOne({ _id: new ObjectId(cat._id) });
				stats.removed++;
			} else {
				console.log(`  [${userId}] conservar "${cat.name}": aún tiene ${remaining} movimientos`);
			}
		}
	}

	console.log('Migración completa:', stats);
	await client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
