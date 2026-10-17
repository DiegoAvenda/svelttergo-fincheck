import { MongoClient } from 'mongodb';
import { MONGODB_DATABASE, MONGODB_URI } from '$env/static/private';

function crearConexion() {
	const cliente = new MongoClient(MONGODB_URI);
	return cliente.connect();
}

// Evita abrir una conexión nueva en cada recarga durante desarrollo
if (!globalThis._mongoClientPromise) {
	globalThis._mongoClientPromise = crearConexion();
}

export async function getDb() {
	const cliente = await globalThis._mongoClientPromise;
	return cliente.db(MONGODB_DATABASE);
}
