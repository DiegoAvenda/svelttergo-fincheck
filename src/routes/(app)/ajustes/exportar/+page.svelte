<script>
</script>

<svelte:head>
	<title>Exportar movimientos — contlana</title>
</svelte:head>

<div class="export-page">
	<div class="top-bar">
		<a href="/ajustes" class="back-link" aria-label="Volver a ajustes">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="page-title">Exportar datos</h1>
		<div style="width: 2.5rem;"></div>
	</div>

	<div class="export-card card">
		<div class="export-icon">
			<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
		</div>

		<h2 class="card-title">Descarga tu historial completo</h2>
		<p class="card-desc">
			Obtén un archivo CSV con todos tus movimientos registrados, comercios, categorías, notas y el desglose de artículos de tus tickets.
		</p>

		<a href="/ajustes/exportar" download="contlana-movimientos.csv" class="btn-primary w-full download-btn">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			<span>Descargar archivo CSV</span>
		</a>
	</div>

	<div class="info-card card">
		<h3 class="info-title">Compatibilidad</h3>
		<p class="info-desc">
			El archivo incluye codificación UTF-8 con BOM para que puedas abrirlo sin problemas en Microsoft Excel, Google Sheets, Numbers o cualquier hoja de cálculo.
		</p>
	</div>
</div>

<style>
	.export-page {
		padding-top: 0.5rem;
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.back-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-lg);
		color: var(--app-text);
		text-decoration: none;
		background: var(--input-bg);
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 700;
	}

	.export-card {
		padding: 2.5rem 1.5rem;
		text-align: center;
		margin-bottom: 1.25rem;
	}

	.export-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4.5rem;
		height: 4.5rem;
		border-radius: var(--radius-2xl);
		background: var(--color-primary-50);
		color: var(--color-primary-600);
		margin-bottom: 1.25rem;
	}

	.card-title {
		font-size: 1.25rem;
		font-weight: 800;
		margin-bottom: 0.5rem;
	}

	.card-desc {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
		margin-bottom: 2rem;
		max-width: 22rem;
		margin-inline: auto;
	}

	.download-btn {
		height: 3.25rem;
		border-radius: var(--radius-xl);
		font-size: 0.9375rem;
		text-decoration: none;
	}

	.info-card {
		padding: 1.25rem;
	}

	.info-title {
		font-size: 0.875rem;
		font-weight: 700;
		margin-bottom: 0.375rem;
	}

	.info-desc {
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		line-height: 1.4;
	}

	.w-full {
		width: 100%;
	}
</style>
