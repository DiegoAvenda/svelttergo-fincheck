import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { betterAuth } from 'better-auth/minimal';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getRequestEvent } from '$app/server';
import { getDb } from '$lib/server/db.js';

const db = await getDb();

export const auth = betterAuth({
	baseURL: dev ? env.ORIGIN : env.PROD_ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: mongodbAdapter(db),
	emailAndPassword: { enabled: true },
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
