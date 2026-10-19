import { env } from '$env/dynamic/private';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function getOpenRouterConfig() {
	const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
	// Opción C (híbrida) con visión: Nemotron 3.5 Super VL -> Nemotron Omni VL -> router free.
	const primary =
		env.OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-super-vl:free';
	const fallback =
		env.OPENROUTER_FALLBACK_MODEL ||
		process.env.OPENROUTER_FALLBACK_MODEL ||
		'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';
	const models = [...new Set([primary, fallback].filter(Boolean))];
	// El router free siempre queda como último recurso aunque el usuario ponga otro fallback.
	if (!models.includes('openrouter/free')) models.push('openrouter/free');
	const appUrl = env.OPENROUTER_APP_URL || process.env.OPENROUTER_APP_URL || '';
	const appTitle =
		env.OPENROUTER_APP_TITLE || process.env.OPENROUTER_APP_TITLE || 'contlana Tickets';
	const timeoutMs = Number(env.OPENROUTER_TIMEOUT_MS || process.env.OPENROUTER_TIMEOUT_MS || 60000);
	const reasoningEffort =
		env.OPENROUTER_REASONING_EFFORT || process.env.OPENROUTER_REASONING_EFFORT || 'none';
	return { apiKey, models, appUrl, appTitle, timeoutMs, reasoningEffort };
}
export async function callOpenRouter({
	system,
	messages,
	max_tokens = 4096,
	temperature = 0.1,
	reasoning
}) {
	const { apiKey, models, appUrl, appTitle, timeoutMs, reasoningEffort } = getOpenRouterConfig();
	if (!apiKey) {
		const err = new Error('missing_openrouter_key');
		err.code = 'missing_openrouter_key';
		throw err;
	}
	const finalMessages = [];
	if (system) finalMessages.push({ role: 'system', content: system });
	for (const m of messages) finalMessages.push(m);
	let lastError = null;

	// Por defecto usamos effort: 'none' en tareas de extracción estructurada
	// para evitar que modelos MoE/reasoning (como Nemotron o R1) gasten todos los tokens en CoT.
	const requestReasoning =
		reasoning !== undefined
			? reasoning
			: reasoningEffort !== 'default'
				? { effort: reasoningEffort }
				: undefined;

	for (const model of models) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(OPENROUTER_URL, {
				method: 'POST',
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					...(appUrl ? { 'HTTP-Referer': appUrl } : {}),
					...(appTitle ? { 'X-Title': appTitle } : {})
				},
				body: JSON.stringify({
					model,
					messages: finalMessages,
					max_tokens,
					temperature,
					...(requestReasoning ? { reasoning: requestReasoning } : {})
				})
			});
			if (!res.ok) {
				const bodyText = await res.text().catch(() => '');
				const err = new Error(`openrouter_${res.status}: ${bodyText.slice(0, 500)}`);
				err.status = res.status;
				err.model = model;
				if (res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400) {
					lastError = err;
					continue;
				}
				throw err;
			}
			const data = await res.json();
			const choice = data?.choices?.[0];
			const msg = choice?.message;

			// Si el modelo cortó por límite de tokens antes de producir el contenido final:
			if (choice?.finish_reason === 'length' && !msg?.content) {
				console.error(`[openrouter] Model ${model} hit token limit during reasoning.`);
				lastError = new Error(`token_limit_exceeded with ${model}`);
				continue;
			}

			// Priorizar msg.content (la respuesta directa del modelo)
			const contentText =
				typeof msg?.content === 'string'
					? msg.content
					: Array.isArray(msg?.content)
						? msg.content
								.map((p) => (typeof p === 'string' ? p : p?.text || ''))
								.join('')
						: '';

			const text =
				contentText.trim() ||
				msg?.reasoning?.trim() ||
				msg?.reasoning_content?.trim() ||
				choice?.text?.trim() ||
				'';
			const modelUsed = data?.model || model;
			if (!text) {
				// Log para depurar qué devolvió el proveedor (sin la imagen)
				console.error(`[openrouter] empty from ${model}:`, JSON.stringify(data)?.slice(0, 800));
				lastError = new Error(`empty_response from ${model}`);
				continue;
			}
			return { text, modelUsed };
		} catch (e) {
			if (e?.name === 'AbortError') {
				lastError = new Error(`timeout con ${model} (${timeoutMs}ms)`);
				continue;
			}
			if (e?.status === 401 || e?.status === 402 || e?.status === 403) throw e;
			lastError = e;
			continue;
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastError || new Error('openrouter_all_models_failed');
}

export function extractJson(text) {
	let jsonText = (text || '').trim();

	// Log para depuración: ver qué devolvió la IA
	console.error('[extractJson] Raw response (first 500 chars):', jsonText.slice(0, 500));

	// Detectar respuestas de seguridad del modelo que no son JSON
	if (
		jsonText.toLowerCase().includes('user safety') ||
		jsonText.toLowerCase().includes('safety: safe') ||
		jsonText.toLowerCase().includes('i cannot') ||
		jsonText.toLowerCase().includes('i apologize')
	) {
		const err = new Error('model_safety_block');
		err.code = 'model_safety_block';
		throw err;
	}

	// 1. Intentar extraer de bloques de código markdown ```json ... ``` o ``` ... ```
	const codeBlockMatches = [...jsonText.matchAll(/```(?:json)?\s*([\s\S]*?)(?:```|$)/gi)];
	for (const match of codeBlockMatches) {
		const candidate = (match[1] || '').trim();
		if (candidate.search(/[{[]/) !== -1) {
			jsonText = candidate;
			break;
		}
	}

	// 2. Localizar el primer '{' o '['
	const startIdx = jsonText.search(/[{[]/);
	if (startIdx === -1) {
		console.error('[extractJson] No JSON start delimiter found in:', jsonText.slice(0, 300));
		throw new Error('no_json_found');
	}

	// 3. Balancear delimitadores respetando cadenas entre comillas y escapes
	let depth = 0;
	let inString = false;
	let escape = false;
	let endIdx = -1;

	for (let i = startIdx; i < jsonText.length; i++) {
		const char = jsonText[i];

		if (escape) {
			escape = false;
			continue;
		}

		if (char === '\\' && inString) {
			escape = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (!inString) {
			if (char === '{' || char === '[') {
				depth++;
			} else if (char === '}' || char === ']') {
				depth--;
				if (depth === 0) {
					endIdx = i + 1;
					break;
				}
			}
		}
	}

	const candidate = endIdx !== -1 ? jsonText.slice(startIdx, endIdx) : jsonText.slice(startIdx);

	console.error('[extractJson] Attempting to parse:', candidate.slice(0, 300));
	try {
		return JSON.parse(candidate);
	} catch (primaryErr) {
		try {
			const cleaned = candidate
				.replace(/,\s*([}\]])/g, '$1')
				.replace(/,\s*$/, '');
			return JSON.parse(cleaned);
		} catch {
			throw primaryErr;
		}
	}
}

export function openRouterErrorMessage(err) {
	if (!err) return 'Ocurrio un error al procesar el ticket con la IA.';
	if (err.code === 'missing_openrouter_key')
		return 'No se ha configurado OPENROUTER_API_KEY. Agrega tu key free de https://openrouter.ai/keys en el .env';
	if (err.code === 'model_safety_block')
		return 'El modelo de IA bloqueo el procesamiento por seguridad. Intenta con otra foto o registra el ticket manualmente.';
	if (err.status === 401)
		return 'La API key de OpenRouter no es valida. Revisa OPENROUTER_API_KEY en tu .env';
	if (err.status === 402)
		return 'Tu key de OpenRouter no tiene creditos. Revisa https://openrouter.ai/credits';
	if (err.status === 429)
		return 'El modelo free esta saturado. Espera unos segundos e intenta de nuevo.';
	if (String(err.message || '').includes('timeout'))
		return 'El modelo free tardo demasiado. Intenta con una foto mas ligera o reintenta.';
	if (String(err.message || '').includes('token_limit_exceeded'))
		return 'El modelo excedió el límite de tokens procesando el ticket. Intenta con una foto más recortada o nítida.';
	if (String(err.message || '').includes('empty_response'))
		return 'La IA no devolvio texto. Intenta con una foto mas nitida.';
	return 'Ocurrio un error al procesar el ticket con la IA. Puedes registrar la compra manualmente.';
}
