import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getOpenRouterConfig } from '$lib/server/ai/openrouter.js';

export async function GET() {
	const hasGroq = Boolean(env.GROQ_API_KEY || process.env.GROQ_API_KEY);
	const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY);
	const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
	const { models } = getOpenRouterConfig();
	return json({
		groq: {
			configured: hasGroq,
			strategy: 'primary',
			model: env.GROQ_MODEL || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'
		},
		openrouter: {
			configured: hasOpenRouter,
			strategy: 'fallback',
			chain: models
		},
		anthropic: { configured: hasAnthropic },
		provider: hasGroq ? 'groq' : hasOpenRouter ? 'openrouter' : hasAnthropic ? 'anthropic' : 'none',
		setupUrl: 'https://groq.com/keys'
	});
}
