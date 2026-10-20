import { z } from 'zod';

export const movementSchema = z.object({
	type: z.enum(['expense', 'income'], { message: 'Tipo inválido' }),
	amount: z
		.string({ message: 'El importe es obligatorio' })
		.min(1, 'El importe es obligatorio')
		.transform((v) => v.replace(/[$\s,]/g, ''))
		.pipe(z.coerce.number().positive('El importe debe ser mayor a 0')),
	categoryId: z.string({ message: 'Selecciona una categoría' }).min(1, 'Selecciona una categoría'),
	date: z.string().optional(),
	merchant: z.string().optional(),
	note: z.string().optional()
});

export const settingsSchema = z.object({
	monthlyIncome: z
		.string()
		.optional()
		.transform((v) => (v ? v.replace(/[$\s,]/g, '') : ''))
		.pipe(
			z.union([
				z.literal('').transform(() => null),
				z.coerce.number().nonnegative('El ingreso no puede ser negativo')
			])
		),
	currency: z.string().default('MXN'),
	monthStartDay: z.coerce.number().int().min(1).max(28).default(1),
	incomeType: z
		.union([
			z.literal('').transform(() => null),
			z.enum(['fixed', 'variable'], { message: 'Tipo de ingreso inválido' })
		])
		.nullable()
		.optional()
});

export const categorySchema = z.object({
	name: z
		.string({ message: 'El nombre es obligatorio' })
		.min(1, 'El nombre es obligatorio')
		.max(50, 'Máximo 50 caracteres'),
	parentId: z.string().optional()
});

/**
 * Valida form data contra un schema y retorna datos parseados o errores.
 * @template T
 * @param {FormData} formData
 * @param {z.ZodType<T>} schema
 * @returns {{ success: true, data: T } | { success: false, errors: Record<string, string> }}
 */
export function validateFormData(formData, schema) {
	const raw = Object.fromEntries(formData);
	const result = schema.safeParse(raw);

	if (result.success) {
		return { success: true, data: result.data };
	}

	/** @type {Record<string, string>} */
	const errors = {};
	for (const issue of result.error.issues) {
		const key = issue.path[0]?.toString() ?? '_form';
		if (!errors[key]) {
			errors[key] = issue.message;
		}
	}

	return { success: false, errors };
}
