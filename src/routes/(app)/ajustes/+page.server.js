import { fail, redirect } from '@sveltejs/kit';
import { getSettings, updateSettings } from '$lib/server/repos/settings.js';
import { auth } from '$lib/server/auth.js';
import { parseAmountToCents, centsToPesos } from '$lib/utils/money.js';

export const load = async (event) => {
	const userId = event.locals.user.id;
	const settings = await getSettings(userId);

	return {
		user: event.locals.user,
		settings: {
			monthlyIncomePesos: settings?.monthlyIncomeCents ? centsToPesos(settings.monthlyIncomeCents) : '',
			currency: settings?.currency || 'MXN',
			monthStartDay: settings?.monthStartDay || 1
		}
	};
};

export const actions = {
	saveSettings: async (event) => {
		const userId = event.locals.user.id;
		const formData = await event.request.formData();

		const incomeStr = formData.get('monthlyIncome')?.toString()?.trim() ?? '';
		const currency = formData.get('currency')?.toString()?.trim() || 'MXN';
		const dayStr = formData.get('monthStartDay')?.toString()?.trim() || '1';

		let monthlyIncomeCents = null;
		if (incomeStr) {
			monthlyIncomeCents = parseAmountToCents(incomeStr);
		}

		const monthStartDay = Math.min(28, Math.max(1, parseInt(dayStr, 10) || 1));

		await updateSettings(userId, {
			monthlyIncomeCents,
			currency,
			monthStartDay
		});

		return { success: true };
	},

	signOut: async (event) => {
		await auth.api.signOut({
			headers: event.request.headers
		});
		return redirect(303, '/login');
	}
};
