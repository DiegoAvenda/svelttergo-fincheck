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
			monthlyIncomePesos: settings?.monthlyIncomeCents
				? centsToPesos(settings.monthlyIncomeCents)
				: '',
			currency: settings?.currency || 'MXN',
			monthStartDay: settings?.monthStartDay || 1,
			incomeType: settings?.incomeType || ''
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
		const incomeTypeRaw = formData.get('incomeType')?.toString()?.trim() || '';
		let incomeType = null;
		if (incomeTypeRaw === 'fixed' || incomeTypeRaw === 'variable') {
			incomeType = incomeTypeRaw;
		} else if (incomeTypeRaw !== '') {
			return fail(400, { error: 'El tipo de ingreso no es válido.' });
		}

		let monthlyIncomeCents = null;
		if (incomeStr) {
			monthlyIncomeCents = parseAmountToCents(incomeStr);
			if (monthlyIncomeCents === null || monthlyIncomeCents < 0) {
				return fail(400, { error: 'El ingreso mensual de referencia no es válido.' });
			}
		}

		const parsedDay = Number(dayStr);
		if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 28) {
			return fail(400, {
				error: 'El día de inicio del ciclo debe estar entre 1 y 28.'
			});
		}

		await updateSettings(userId, {
			monthlyIncomeCents,
			currency,
			monthStartDay: parsedDay,
			incomeType
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
