<script>
	import { enhance } from '$app/forms';
	import { formatMoney } from '$lib/utils/money.js';
	import { formatDate } from '$lib/utils/periods.js';

	let { data, form } = $props();

	let noticeDismissed = $state(false);
</script>

<svelte:head>
	<title>Inicio — Fincheck</title>
</svelte:head>

<div class="home-page">
	<!-- Aviso de movimiento creado con Deshacer / Editar -->
	{#if data.createdNotice && !noticeDismissed && !form?.undone}
		<div class="created-toast card">
			<div class="toast-left">
				<span class="toast-icon">✓</span>
				<span>{data.createdNotice.type === 'income' ? 'Ingreso' : 'Gasto'} registrado</span>
			</div>
			<div class="toast-actions">
				<a href="/movimientos/{data.createdNotice.id}" class="toast-btn edit">Editar</a>
				<form method="post" action="?/undo" use:enhance>
					<input type="hidden" name="id" value={data.createdNotice.id} />
					<button type="submit" class="toast-btn undo">Deshacer</button>
				</form>
				<button type="button" class="close-toast" onclick={() => (noticeDismissed = true)}>✕</button
				>
			</div>
		</div>
	{/if}

	{#if form?.undone}
		<div class="undone-banner card">
			<span>Movimiento deshecho.</span>
		</div>
	{/if}

	<!-- Encabezado con periodo actual -->
	<header class="home-header">
		<div>
			<span class="period-sub">Resumen del mes</span>
			<h1 class="month-title">{data.monthLabel}</h1>
		</div>
	</header>

	<!-- Tres cifras clave del mes: Ingresos, Gastos, Balance -->
	<div class="stats-grid">
		<div class="stat-card card">
			<span class="stat-label">Ingresos</span>
			<span class="stat-value income-val">{formatMoney(data.incomeCents)}</span>
		</div>

		<div class="stat-card card">
			<span class="stat-label">Gastos</span>
			<span class="stat-value expense-val">{formatMoney(data.expensesCents)}</span>
		</div>

		<div class="stat-card balance-card card">
			<span class="stat-label">Balance</span>
			<span
				class="stat-value"
				class:positive={data.balanceCents > 0}
				class:negative={data.balanceCents < 0}
			>
				{formatMoney(data.balanceCents)}
			</span>
		</div>
	</div>

	<!-- Top categorías de gasto -->
	<section class="section">
		<div class="section-header">
			<h2 class="section-title">En qué se va el dinero</h2>
			<a href="/habitos" class="section-link">Ver todo</a>
		</div>

		{#if data.topCategories.length === 0}
			<div class="empty-compact card">
				<p>Aún no hay gastos registrados este mes.</p>
			</div>
		{:else}
			<div class="categories-card card">
				{#each data.topCategories as cat, i}
					<div class="category-row">
						<div class="cat-info">
							<span class="cat-name">{cat.name}</span>
							<div class="cat-amounts">
								<span class="cat-money">{formatMoney(cat.totalCents)}</span>
								{#if cat.incomePct !== null && cat.incomePct !== undefined}
									<span class="cat-income-pct">{cat.incomePct}% del ingreso</span>
								{/if}
								<span class="cat-pct">{cat.pct}%</span>
							</div>
						</div>
						<!-- Barra de progreso simple -->
						<div class="progress-track">
							<div class="progress-bar" style="width: {cat.pct}%;"></div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Últimos movimientos -->
	<section class="section">
		<div class="section-header">
			<h2 class="section-title">Últimos movimientos</h2>
			<a href="/movimientos" class="section-link">Historial</a>
		</div>

		{#if data.recentMovements.length === 0}
			<div class="empty-state card">
				<div class="empty-icon-circle">
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
				</div>
				<h3 class="empty-heading">Tu registro está vacío</h3>
				<p class="empty-desc">
					Comienza anotando tu primer gasto o toma una foto de un ticket de compra.
				</p>
				<div class="empty-cta-row">
					<a href="/registrar" class="btn-primary">Registrar gasto</a>
					<a href="/escanear" class="btn-secondary">Escanear ticket</a>
				</div>
			</div>
		{:else}
			<div class="recent-card card">
				{#each data.recentMovements as m, idx}
					{#if idx > 0}
						<div class="divider"></div>
					{/if}
					<a href="/movimientos/{m.id}" class="movement-row">
						<div class="m-left">
							<div class="m-icon" class:income={m.type === 'income'}>
								{#if m.source === 'ticket'}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<rect x="3" y="3" width="18" height="18" rx="2" />
										<line x1="7" y1="8" x2="17" y2="8" />
										<line x1="7" y1="12" x2="17" y2="12" />
									</svg>
								{:else if m.type === 'income'}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="18 15 12 9 6 15" />
									</svg>
								{:else}
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="6 9 12 15 18 9" />
									</svg>
								{/if}
							</div>
							<div class="m-texts">
								<span class="m-title"
									>{m.merchant || m.note || (m.type === 'income' ? 'Ingreso' : 'Gasto')}</span
								>
								<span class="m-meta">{m.categoryName} • {formatDate(new Date(m.date))}</span>
							</div>
						</div>
						<div class="m-right">
							<span class="m-amount" class:income-text={m.type === 'income'}>
								{m.type === 'income' ? '+' : '-'}{formatMoney(m.amountCents)}
							</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.home-page {
		padding-top: 0.5rem;
	}

	.created-toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: var(--color-primary-50);
		border: 1px solid var(--color-primary-200);
		margin-bottom: 1.25rem;
		animation: slideDown 200ms ease;
	}

	.undone-banner {
		padding: 0.75rem 1rem;
		background: var(--input-bg);
		margin-bottom: 1.25rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.toast-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-primary-800);
	}

	.toast-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		background: var(--color-primary-500);
		color: white;
		border-radius: 50%;
		font-size: 0.75rem;
	}

	.toast-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toast-btn {
		font-size: 0.8125rem;
		font-weight: 600;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		text-decoration: none;

		&.edit {
			color: var(--app-text);
		}

		&.undo {
			color: var(--color-danger-600);
		}
	}

	.close-toast {
		background: none;
		border: none;
		color: var(--app-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		font-size: 0.875rem;
	}

	.home-header {
		margin-bottom: 1.25rem;
	}

	.period-sub {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--app-text-secondary);
	}

	.month-title {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		text-transform: capitalize;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.balance-card {
		grid-column: span 2;
	}

	.stat-card {
		padding: 1rem 1.125rem;
	}

	.stat-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--app-text-secondary);
		margin-bottom: 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;

		&.income-val {
			color: var(--color-primary-600);
		}

		&.expense-val {
			color: var(--app-text);
		}

		&.positive {
			color: var(--color-primary-600);
		}

		&.negative {
			color: var(--color-danger-500);
		}
	}

	.balance-card .stat-value {
		font-size: 1.625rem;
	}

	.section {
		margin-bottom: 1.75rem;
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.section-title {
		font-size: 1.0625rem;
		font-weight: 700;
	}

	.section-link {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-primary-600);
		text-decoration: none;
	}

	.categories-card {
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.category-row {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.cat-info {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.cat-name {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.cat-amounts {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.cat-money {
		font-size: 0.875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.cat-income-pct {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-primary-600);
		background: var(--color-primary-50);
		padding: 0.0625rem 0.375rem;
		border-radius: var(--radius-sm);
	}

	.cat-pct {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--app-text-secondary);
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
		transition: width 300ms ease;
	}

	.recent-card {
		overflow: hidden;
	}

	.movement-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		text-decoration: none;
		color: var(--app-text);
		transition: background 150ms ease;

		&:hover {
			background: var(--color-surface-100);
		}
	}

	.divider {
		height: 1px;
		background: var(--app-border);
		margin-left: 3.5rem;
	}

	.m-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.m-icon {
		width: 2.125rem;
		height: 2.125rem;
		border-radius: var(--radius-md);
		background: var(--color-surface-200);
		color: var(--app-text);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;

		&.income {
			background: var(--color-primary-100);
			color: var(--color-primary-600);
		}
	}

	.m-texts {
		min-width: 0;
	}

	.m-title {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.m-meta {
		display: block;
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		margin-top: 0.125rem;
	}

	.m-right {
		text-align: right;
		flex-shrink: 0;
		padding-left: 0.5rem;
	}

	.m-amount {
		font-size: 0.875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;

		&.income-text {
			color: var(--color-primary-600);
		}
	}

	.empty-compact {
		padding: 1.25rem;
		text-align: center;
		font-size: 0.875rem;
		color: var(--app-text-secondary);
	}

	.empty-state {
		padding: 2.5rem 1.5rem;
		text-align: center;
	}

	.empty-icon-circle {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		background: var(--color-primary-50);
		color: var(--color-primary-600);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1rem;
	}

	.empty-heading {
		font-size: 1.0625rem;
		font-weight: 700;
		margin-bottom: 0.375rem;
	}

	.empty-desc {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		line-height: 1.4;
		margin-bottom: 1.5rem;
	}

	.empty-cta-row {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}

	@keyframes slideDown {
		from {
			transform: translateY(-10px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
