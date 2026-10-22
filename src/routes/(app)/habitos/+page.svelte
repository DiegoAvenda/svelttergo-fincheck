<script>
	import { goto } from '$app/navigation';
	import { formatMoney } from '$lib/utils/money.js';

	let { data } = $props();

	function setPeriod(p) {
		goto(`/habitos?period=${p}`, { noScroll: true });
	}
</script>

<svelte:head>
	<title>Hábitos de consumo — NAVEDDY</title>
</svelte:head>

<div class="habitos-page">
	<div class="header">
		<div>
			<h1 class="page-title">Hábitos de consumo</h1>
			<p class="subtitle">Descubre en qué categorías y rutinas se concentra tu dinero.</p>
		</div>
	</div>

	<!-- Selector de periodo -->
	<div class="period-pills">
		<button
			type="button"
			class="pill"
			class:active={data.period === 'this-month'}
			onclick={() => setPeriod('this-month')}
		>
			Este mes
		</button>
		<button
			type="button"
			class="pill"
			class:active={data.period === 'last-month'}
			onclick={() => setPeriod('last-month')}
		>
			Mes pasado
		</button>
		<button
			type="button"
			class="pill"
			class:active={data.period === 'last-3-months'}
			onclick={() => setPeriod('last-3-months')}
		>
			Últimos 3 meses
		</button>
	</div>

	<!-- Total gastado en el periodo -->
	<div class="summary-card card">
		<span class="summary-label">Gasto en {data.periodLabel.toLowerCase()}</span>
		<span class="summary-value">{formatMoney(data.totalSpendingCents)}</span>
	</div>

	<!-- Lista de categorías por gasto -->
	{#if data.categoriesList.length === 0}
		<div class="empty-state card">
			<p class="empty-title">Sin gastos en este periodo</p>
			<p class="empty-sub">
				Registra tus gastos o tickets para ver en qué hábitos se distribuye tu dinero.
			</p>
		</div>
	{:else}
		<div class="categories-list">
			{#each data.categoriesList as cat}
				<a href="/habitos/{cat.categoryId}" class="cat-card card">
					<div class="cat-top">
						<div class="cat-title-row">
							<span class="cat-name">{cat.name}</span>
							<span class="cat-amount">{formatMoney(cat.totalCents)}</span>
						</div>

						<!-- Barra de proporción -->
						<div class="progress-track">
							<div class="progress-bar" style="width: {cat.totalPct}%;"></div>
						</div>
					</div>

					<div class="cat-bottom">
						<div class="tags-left">
							{#if cat.incomePct !== null}
								<span class="badge income-badge">
									{cat.incomePct}% del ingreso
								</span>
							{/if}
							<span class="badge count-badge">
								{cat.count}
								{cat.count === 1 ? 'compra' : 'compras'}
							</span>
						</div>

						<div class="change-tag">
							{#if cat.changePct !== null}
								{#if cat.changePct > 0}
									<span class="change-text increase">+{cat.changePct}% vs anterior</span>
								{:else if cat.changePct < 0}
									<span class="change-text decrease">{cat.changePct}% vs anterior</span>
								{:else}
									<span class="change-text neutral">Sin cambio</span>
								{/if}
							{:else}
								<span class="change-text neutral">—</span>
							{/if}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.habitos-page {
		padding-top: 0.5rem;
	}

	.header {
		margin-bottom: 1.25rem;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.subtitle {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		margin-top: 0.25rem;
	}

	.period-pills {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
		overflow-x: auto;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}
	}

	.pill {
		flex: 1;
		padding: 0.5rem 0.75rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-lg);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text-secondary);
		cursor: pointer;
		text-align: center;
		white-space: nowrap;
		transition: all 150ms ease;

		&:hover {
			background: var(--color-surface-200);
		}

		&.active {
			background: var(--app-text);
			color: var(--card-bg);
			border-color: var(--app-text);
		}
	}

	.summary-card {
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.summary-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--app-text-secondary);
		margin-bottom: 0.25rem;
	}

	.summary-value {
		font-size: 1.625rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.categories-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.cat-card {
		padding: 1rem 1.25rem;
		text-decoration: none;
		color: var(--app-text);
		transition:
			transform 100ms ease,
			box-shadow 150ms ease;

		&:active {
			transform: scale(0.99);
		}
	}

	.cat-top {
		margin-bottom: 0.75rem;
	}

	.cat-title-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.cat-name {
		font-size: 0.9375rem;
		font-weight: 700;
	}

	.cat-amount {
		font-size: 0.9375rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.progress-track {
		width: 100%;
		height: 0.375rem;
		background: var(--input-bg);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: var(--color-primary-500);
		border-radius: var(--radius-full);
	}

	.cat-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
	}

	.tags-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.badge {
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		font-weight: 600;
	}

	.income-badge {
		background: var(--color-primary-50);
		color: var(--color-primary-700);
	}

	.count-badge {
		background: var(--input-bg);
		color: var(--app-text-secondary);
	}

	.change-tag {
		font-size: 0.75rem;
		font-weight: 600;
	}

	.change-text {
		&.increase {
			color: var(--color-danger-500);
		}
		&.decrease {
			color: var(--color-primary-600);
		}
		&.neutral {
			color: var(--app-text-secondary);
		}
	}

	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
	}

	.empty-title {
		font-size: 1.0625rem;
		font-weight: 700;
		margin-bottom: 0.375rem;
	}

	.empty-sub {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
	}
</style>
