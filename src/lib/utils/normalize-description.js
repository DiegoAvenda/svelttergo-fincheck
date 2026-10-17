/**
 * Normaliza una descripción de artículo de ticket para matching.
 * - Minúsculas
 * - Sin acentos
 * - Sin puntuación (excepto puntos decimales en medidas como 2.5l)
 * - Espacios únicos
 * - Conserva números relevantes (600ml, 2.5l, 1kg)
 * @param {string} description
 * @returns {string}
 */
export function normalizeDescription(description) {
	if (!description || typeof description !== 'string') return '';

	return (
		description
			.toLowerCase()
			// Quitar acentos
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			// Preservar números con unidades (600ml, 2.5l, 1kg, etc.)
			// y puntos decimales entre dígitos (2.5)
			// Quitar puntuación excepto puntos entre dígitos
			.replace(/\.(?!\d)/g, '') // punto que no va seguido de dígito
			.replace(/(?<!\d)\./g, '') // punto que no viene tras dígito
			.replace(/[^\w\s.]/g, '') // quitar todo salvo alfanuméricos, espacios y puntos
			// Colapsar espacios
			.replace(/\s+/g, ' ')
			.trim()
	);
}
