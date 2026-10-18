import { redirect } from '@sveltejs/kit';
import { getSettings } from '$lib/server/repos/settings.js';
import { ensureFixedCategories } from '$lib/server/repos/categories.js';
import { ensureIndexes } from '$lib/server/indexes.js';

let indexesCreated = false;

export const load = async (event) => {
	// Crear índices una vez
	if (!indexesCreated) {
		await ensureIndexes();
		indexesCreated = true;
	}

	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const userId = event.locals.user.id;
	const settings = await getSettings(userId);

	// Auto-migración idempotente al catálogo fijo (usuarios con categorías legacy
	// como Chocolates/Agua/Otros las ven convertidas sin correr scripts manuales).
	try {
		await ensureFixedCategories(userId);
	} catch (err) {
		console.error('[layout] ensureFixedCategories error:', err);
	}

	// Si no tiene settings, es primer uso → bienvenida
	if (!settings && event.url.pathname !== '/bienvenida') {
		return redirect(302, '/bienvenida');
	}

	return {
		user: event.locals.user,
		settings: settings
			? {
					monthlyIncomeCents: settings.monthlyIncomeCents,
					currency: settings.currency,
					monthStartDay: settings.monthStartDay
				}
			: null
	};
};
