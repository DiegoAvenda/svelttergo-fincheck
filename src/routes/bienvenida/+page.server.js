import { redirect, fail } from '@sveltejs/kit';
import { getSettings, upsertSettings } from '$lib/server/repos/settings.js';
import { seedDefaultCategories } from '$lib/server/repos/categories.js';
import { parseAmountToCents } from '$lib/utils/money.js';

export const load = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}

	const userId = event.locals.user.id;
	const settings = await getSettings(userId);
	if (settings) {
		return redirect(302, '/');
	}

	return {
		user: event.locals.user
	};
};

export const actions = {
	save: async (event) => {
		if (!event.locals.user) {
			return redirect(302, '/login');
		}
		const userId = event.locals.user.id;
		const formData = await event.request.formData();
		const incomeStr = formData.get('monthlyIncome')?.toString()?.trim() ?? '';

		let monthlyIncomeCents = null;
		if (incomeStr) {
			monthlyIncomeCents = parseAmountToCents(incomeStr);
			if (monthlyIncomeCents === null || monthlyIncomeCents < 0) {
				return fail(400, {
					error: 'Por favor ingresa un monto válido',
					values: { monthlyIncome: incomeStr }
				});
			}
		}

		await Promise.all([
			upsertSettings(userId, {
				monthlyIncomeCents,
				currency: 'MXN'
			}),
			seedDefaultCategories(userId)
		]);

		return redirect(302, '/');
	},

	skip: async (event) => {
		if (!event.locals.user) {
			return redirect(302, '/login');
		}
		const userId = event.locals.user.id;

		await Promise.all([
			upsertSettings(userId, {
				monthlyIncomeCents: null,
				currency: 'MXN'
			}),
			seedDefaultCategories(userId)
		]);

		return redirect(302, '/');
	}
};
