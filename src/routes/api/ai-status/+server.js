import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getOpenRouterConfig } from '$lib/server/ai/openrouter.js';

export async function GET() {
	const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY);
	const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
	const { models } = getOpenRouterConfig();
	return json({
		openrouter: {
			configured: hasOpenRouter,
			strategy: 'hybrid-pinned-plus-free-router',
			chain: models
		},
		anthropic: { configured: hasAnthropic },
		provider: hasOpenRouter ? 'openrouter' : hasAnthropic ? 'anthropic' : 'none',
		setupUrl: 'https://openrouter.ai/keys'
	});
}
