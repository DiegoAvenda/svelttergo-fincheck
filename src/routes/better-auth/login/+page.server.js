import { fail, redirect } from '@sveltejs/kit';

import { auth } from '$lib/server/auth';

export const load = (event) => {
	if (event.locals.user) {
		return redirect(302, '/better-auth');
	}
	return {};
};

export const actions = {
	signInSocial: async (event) => {
		const formData = await event.request.formData();
		const provider = formData.get('provider')?.toString() ?? 'google';
		const callbackURL = formData.get('callbackURL')?.toString() ?? '/better-auth';

		const result = await auth.api.signInSocial({
			body: {
				provider: provider,
				callbackURL
			}
		});

		if (result.url) {
			return redirect(302, result.url);
		}
		return fail(400, { message: 'Social sign-in failed' });
	}
};
