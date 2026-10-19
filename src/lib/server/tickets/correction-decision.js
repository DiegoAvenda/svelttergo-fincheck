import { normalizeDescription as defaultNormalizeDescription } from '../../utils/normalize-description.js';

/**
 * Decide si un ítem revisado de un ticket debe memorizarse en `item_corrections`.
 *
 * Regla de negocio: SOLO se aprende de información nueva aportada por el usuario.
 * Un ítem se memoriza cuando el usuario:
 *  - aclaró un ítem que la IA dejó ambiguo o pendiente, o
 *  - editó la descripción respecto a la original de la IA, o
 *  - cambió la categoría o subcategoría respecto a la propuesta de la IA.
 *
 * Los ítems que la IA resolvió sola y el usuario no tocó NO se memorizan: el
 * historial ya vive en `movements.items` y no tiene sentido repetir ahí lo que
 * la propia IA volvería a producir.
 *
 * Importante: `originalDescription` debe ser la descripción que propuso la IA
 * (p. ej. la `cleanDescription` del borrador), NO el texto crudo del ticket.
 * Comparar contra el texto crudo genera falsos positivos en cada ítem donde la
 * IA expandió/limpió la abreviatura.
 *
 * @param {{
 *   status?: string|null,
 *   categoryId?: string|null,
 *   originalCategoryId?: string|null,
 *   subcategoryKey?: string|null,
 *   originalSubcategoryKey?: string|null,
 *   description?: string|null,
 *   originalDescription?: string|null,
 *   normalizeDescription?: (value: string) => string
 * }} input
 * @returns {boolean}
 */
export function shouldPersistCorrection({
	status,
	categoryId,
	originalCategoryId,
	subcategoryKey,
	originalSubcategoryKey,
	description,
	originalDescription,
	normalizeDescription = defaultNormalizeDescription
}) {
	const resolvedCategory = (categoryId || '').toString().trim();
	const currentSub = (subcategoryKey || '').toString().trim();
	const normStatus = (status || '').toString().trim();

	// Sin categoría resuelta no hay nada que aprender (sigue pendiente).
	if (!resolvedCategory) return false;

	// El usuario aclaró un ítem que la IA no pudo resolver.
	if (normStatus === 'ambiguous' || normStatus === 'pending') return true;

	// Cambió la clasificación (categoría o subcategoría) respecto a la IA.
	const origCategory = (originalCategoryId || '').toString().trim();
	const origSub = (originalSubcategoryKey || '').toString().trim();
	if (origCategory !== resolvedCategory) return true;
	if (origSub !== currentSub) return true;

	// Editó la descripción respecto a la que propuso la IA.
	const origDescription = (originalDescription || '').toString().trim();
	if (origDescription) {
		const before = normalizeDescription(origDescription);
		const after = normalizeDescription((description || '').toString());
		if (before !== after) return true;
	}

	return false;
}
