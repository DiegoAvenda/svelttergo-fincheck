/**
 * Normalización post-IA de items de ticket.
 * Fusiona líneas de descuento/rebaja con el artículo previo
 * para que nunca aparezcan como items separados.
 * Preserva los campos nuevos de la IA: itemCode (EAN/UPC), rawDescription
 * (texto exacto), cleanDescription (expandida con departamento), department,
 * categoryId sugerido y status identified|ambiguous|pending.
 *
 * Caso Bodega Aurrera / Walmart / Soriana:
 *   "MARUCHAN VA 18.00 x 1" + "Rebaja 1X$14 -4.00 x 1 14.00"
 *   => [{ originalDescription: "MARUCHAN VA", amount: 14 }]
 *
 * @param {Array<{ originalDescription?: string, rawDescription?: string, cleanDescription?: string, itemCode?: string|null, department?: string|null, categoryId?: string|null, amount?: number, price?: number, status?: string }>} rawItems
 * @returns {Array<{ itemCode: string|null, rawDescription: string, cleanDescription: string, originalDescription: string, department: string|null, categoryId: string|null, amount: number, status: string }>}
 */
export function normalizeTicketItems(rawItems) {
	if (!Array.isArray(rawItems)) return [];

	const DISCOUNT_RE =
		/\b(rebaja|rebajas|descuento|descuentos|ahorro|ahorraste|multiahorro|multi\s*ahorro|promo(?:cion|ción)?|bonificaci[oó]n|deduc)/i;

	// Encabezados de departamento, resúmenes y leyendas que nunca son productos.
	const NON_ITEM_RE =
		/(^-{2,}$|abarrotes|departamento|lacteos|lácteos|frutas|verduras|panader[ií]a|carnicer[ií]a|bebidas|articulos comprados|artículos comprados|^total\b|^subtotal\b|\biva\b|\bieps\b|\bcambio\b|\befectivo\b|\btarjeta\b|\bfolio\b|\bahorraste\b|\bahorro total\b|forma de pago|n[oó]mina|puntos|monedero)/i;

	const round2 = (n) => Math.round(n * 100) / 100;

	/** @type {Array<{ itemCode: string|null, rawDescription: string, cleanDescription: string, originalDescription: string, department: string|null, categoryId: string|null, amount: number, status: string }>} */
	const merged = [];

	for (const raw of rawItems) {
		const rawDesc = (raw?.rawDescription || raw?.originalDescription || '').trim();
		const cleanDesc = (raw?.cleanDescription || raw?.originalDescription || rawDesc || '').trim();
		const desc = cleanDesc || rawDesc;
		let amount = Number(raw?.amount);
		if (Number.isNaN(amount) || !Number.isFinite(amount)) {
			const price = Number(raw?.price);
			amount = Number.isFinite(price) ? price : 0;
		}
		if (!desc) continue;
		if (!Number.isFinite(amount)) amount = 0;
		amount = round2(amount);
		const status = raw?.status === 'ambiguous' ? 'ambiguous' : raw?.status === 'pending' ? 'pending' : 'identified';
		const itemCode = (raw?.itemCode || '').toString().trim() || null;
		const department = (raw?.department || '').toString().trim() || null;
		const categoryId = (raw?.categoryId || '').toString().trim() || null;

		// 1. Descartar encabezados / resúmenes aunque la IA los haya incluido.
		if (NON_ITEM_RE.test(desc) || /-{4,}/.test(desc)) continue;

		const isDiscount = DISCOUNT_RE.test(desc);

		// 2. Línea de descuento / rebaja: nunca es un item nuevo.
		if (isDiscount) {
			const prev = merged[merged.length - 1];
			if (!prev) continue; // rebaja huérfana: se ignora.

			// a) Buscar el monto del descuento explícito en la descripción: "-4.00", "-$4.00"
			const explicit = desc.match(/-\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/);
			if (explicit) {
				const d = Number(explicit[1].replace(',', '.'));
				if (Number.isFinite(d) && d > 0) {
					prev.amount = Math.max(0, round2(prev.amount - d));
					continue;
				}
			}

			// b) Amount negativo => es el descuento a sumar.
			if (amount < 0) {
				prev.amount = Math.max(0, round2(prev.amount + amount));
				continue;
			}

			// c) Amount positivo: casi siempre la IA repite el precio final neto
			//    (ej. prev 18 + rebaja 14 => final 14).
			//    Heurística: si es <= mitad del previo, probablemente sea la
			//    magnitud del descuento (4) y no el precio final (14).
			if (amount > 0) {
				if (amount < prev.amount && amount <= prev.amount / 2) {
					prev.amount = Math.max(0, round2(prev.amount - amount));
				} else if (amount < prev.amount) {
					prev.amount = round2(amount);
				} else if (amount === prev.amount) {
					// duplicado del final: no cambia nada.
				} else {
					// amount mayor que el previo: conservar el menor (el final).
					prev.amount = Math.min(prev.amount, amount);
				}
				continue;
			}

			// d) Sin monto útil: descartar.
			continue;
		}

		// 3. Monto negativo sin palabra de descuento: también es descuento encubierto.
		if (amount < 0) {
			const prev = merged[merged.length - 1];
			if (prev) {
				prev.amount = Math.max(0, round2(prev.amount + amount));
				continue;
			}
			continue;
		}

		merged.push({
			itemCode,
			rawDescription: rawDesc || desc,
			cleanDescription: cleanDesc || desc,
			originalDescription: desc,
			department,
			categoryId,
			amount,
			status
		});
	}

	return merged;
}

/**
 * @param {string} description
 * @returns {boolean} true si la descripción es una línea de descuento/rebaja.
 */
export function isDiscountLine(description) {
	if (!description || typeof description !== 'string') return false;
	return /\b(rebaja|rebajas|descuento|descuentos|ahorro|ahorraste|multiahorro|multi\s*ahorro|promo(?:cion|ción)?|bonificaci[oó]n)\b/i.test(
		description
	);
}
