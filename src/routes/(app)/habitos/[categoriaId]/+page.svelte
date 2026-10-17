<script>
	import { formatMoney } from '$lib/utils/money.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.categoryName} — Hábitos — Fincheck</title>
</svelte:head>

<div class="habit-detail-page">
	<div class="top-bar">
		<a href="/habitos?period={data.period}" class="back-link" aria-label="Volver a hábitos">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="page-title">{data.categoryName}</h1>
		<div style="width: 2.5rem;"></div>
	</div>

	<div class="period-sub">{data.periodLabel}</div>

	<!-- Métricas clave -->
	<div class="metrics-grid">
		<div class="metric-card card">
			<span class="m-label">Total gastado</span>
			<span class="m-val">{formatMoney(data.detail.totalCents)}</span>
		</div>

		<div class="metric-card card">
			<span class="m-label">Compras</span>
			<span class="m-val">{data.detail.count}</span>
		</div>

		<div class="metric-card card span-2">
			<span class="m-label">Promedio por compra</span>
			<span class="m-val">{formatMoney(data.detail.avgCents)}</span>
		</div>
	</div>

	<!-- Principales comercios -->
	{#if data.detail.topMerchants.length > 0}
		<section class="section">
			<h2 class="section-title">Comercios principales</h2>
			<div class="list-card card">
				{#each data.detail.topMerchants as m, i}
					{#if i > 0}
						<div class="divider"></div>
					{/if}
					<div class="row">
						<span class="row-name">{m.name}</span>
						<span class="row-val">{formatMoney(m.totalCents)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Artículos que más pesan -->
	{#if data.detail.topItems.length > 0}
		<section class="section">
			<h2 class="section-title">Artículos que más pesan</h2>
			<div class="list-card card">
				{#each data.detail.topItems as item, i}
					{#if i > 0}
						<div class="divider"></div>
					{/if}
					<div class="row">
						<div class="item-meta">
							<span class="row-name">{item.description}</span>
							<span class="item-count">{item.count} {item.count === 1 ? 'vez' : 'veces'}</span>
						</div>
						<span class="row-val">{formatMoney(item.totalCents)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.detail.count === 0}
		<div class="empty-state card">
			<p class="empty-title">Sin registros</p>
			<p class="empty-sub">No hay movimientos en esta categoría para el periodo seleccionado.</p>
		</div>
	{/if}
</div>

<style>
	.habit-detail-page {
		padding-top: 0.5rem;
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
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
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.period-sub {
		text-align: center;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text-secondary);
		margin-bottom: 1.25rem;
		text-transform: capitalize;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.span-2 {
		grid-column: span 2;
	}

	.metric-card {
		padding: 1rem 1.125rem;
	}

	.m-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--app-text-secondary);
		margin-bottom: 0.25rem;
	}

	.m-val {
		font-size: 1.375rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 700;
		margin-bottom: 0.625rem;
	}

	.list-card {
		overflow: hidden;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.125rem;
		gap: 0.75rem;
	}

	.row-name {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.row-val {
		font-size: 0.875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.item-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.item-count {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
	}

	.divider {
		height: 1px;
		background: var(--app-border);
	}

	.empty-state {
		padding: 2.5rem 1.5rem;
		text-align: center;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
	}

	.empty-sub {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
	}
</style>
