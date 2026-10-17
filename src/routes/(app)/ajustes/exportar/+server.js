import { listMovements } from '$lib/server/repos/movements.js';
import { getCategoriesByUser } from '$lib/server/repos/categories.js';
import { centsToPesos } from '$lib/utils/money.js';

function escapeCsvField(val) {
	if (val === null || val === undefined) return '';
	const str = String(val);
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

export const GET = async ({ locals }) => {
	if (!locals.user) {
		return new Response('No autorizado', { status: 401 });
	}

	const userId = locals.user.id;

	const [categories, { movements }] = await Promise.all([
		getCategoriesByUser(userId),
		listMovements(userId, { limit: 10000 })
	]);

	const categoryMap = new Map();
	for (const c of categories) {
		categoryMap.set(c._id.toString(), c.name);
	}

	const headers = ['ID', 'Fecha', 'Tipo', 'Importe_MXN', 'Comercio', 'Categoria', 'Nota', 'Origen', 'Articulos'];
	const rows = [headers.join(',')];

	for (const m of movements) {
		const catName = m.categoryId ? categoryMap.get(m.categoryId.toString()) || '' : '';
		const dateStr = m.date.toISOString().slice(0, 10);
		const pesos = centsToPesos(m.amountCents).toFixed(2);
		const itemsSummary = (m.items || []).map((it) => `${it.originalDescription} ($${centsToPesos(it.amountCents).toFixed(2)})`).join('; ');

		const row = [
			escapeCsvField(m._id.toString()),
			escapeCsvField(dateStr),
			escapeCsvField(m.type === 'income' ? 'Ingreso' : 'Gasto'),
			escapeCsvField(pesos),
			escapeCsvField(m.merchant || ''),
			escapeCsvField(catName),
			escapeCsvField(m.note || ''),
			escapeCsvField(m.source || 'manual'),
			escapeCsvField(itemsSummary)
		];

		rows.push(row.join(','));
	}

	// Agregar BOM UTF-8 para que Excel en español/Windows lo abra perfectamente
	const csvContent = '\uFEFF' + rows.join('\r\n');

	return new Response(csvContent, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="fincheck-movimientos.csv"'
		}
	});
};
