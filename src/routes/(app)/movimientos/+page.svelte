<script>
	import { goto } from '$app/navigation';
	import { formatMoney } from '$lib/utils/money.js';
	import { formatDayGroup } from '$lib/utils/periods.js';

	let { data } = $props();

	let searchQuery = $state(data.filters.search);
	let selectedPeriod = $state(data.filters.period);
	let selectedCategory = $state(data.filters.categoryId);

	function updateFilters() {
		const params = new URLSearchParams();
		if (searchQuery) params.set('q', searchQuery);
		if (selectedPeriod && selectedPeriod !== 'this-month') params.set('period', selectedPeriod);
		if (selectedCategory) params.set('cat', selectedCategory);
		goto(`/movimientos?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function handlePeriodChange(p) {
		selectedPeriod = p;
		updateFilters();
	}

	function handleCategoryChange(e) {
		selectedCategory = e.target.value;
		updateFilters();
	}

	let searchTimeout;
	function handleSearchInput(e) {
		searchQuery = e.target.value;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			updateFilters();
		}, 300);
	}

	function loadMore() {
		const params = new URLSearchParams(window.location.search);
		params.set('limit', String(data.limit + 20));
		goto(`/movimientos?${params.toString()}`, { noScroll: true });
	}

	// Agrupar movimientos por día
	const groupedMovements = $derived.by(() => {
		/** @type {Array<{ dateLabel: string, items: typeof data.movements }>} */
		const groups = [];
		let currentDay = '';
		let currentItems = [];

		for (const m of data.movements) {
			const dateObj = new Date(m.date);
			const dayLabel = formatDayGroup(dateObj);

			if (dayLabel !== currentDay) {
				if (currentItems.length > 0) {
					groups.push({ dateLabel: currentDay, items: currentItems });
				}
				currentDay = dayLabel;
				currentItems = [m];
			} else {
				currentItems.push(m);
			}
		}

		if (currentItems.length > 0) {
			groups.push({ dateLabel: currentDay, items: currentItems });
		}

		return groups;
	});
</script>

<svelte:head>
	<title>Movimientos — contlana</title>
</svelte:head>

<div class="movimientos-page">
	<div class="header">
		<h1 class="page-title">Movimientos</h1>
		<span class="total-badge">{data.total} {data.total === 1 ? 'registro' : 'registros'}</span>
	</div>

	<!-- Barra de búsqueda -->
	<div class="search-box">
		<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
		<input
			type="search"
			value={searchQuery}
			oninput={handleSearchInput}
			placeholder="Buscar comercio, nota o producto..."
			class="search-input"
		/>
		{#if searchQuery}
			<button
				type="button"
				class="clear-btn"
				onclick={() => {
					searchQuery = '';
					updateFilters();
				}}
				aria-label="Limpiar búsqueda"
			>
				✕
			</button>
		{/if}
	</div>

	<!-- Filtro de Periodos -->
	<div class="period-pills">
		<button
			type="button"
			class="pill"
			class:active={selectedPeriod === 'this-month'}
			onclick={() => handlePeriodChange('this-month')}
		>
			Este mes
		</button>
		<button
			type="button"
			class="pill"
			class:active={selectedPeriod === 'last-month'}
			onclick={() => handlePeriodChange('last-month')}
		>
			Mes pasado
		</button>
		<button
			type="button"
			class="pill"
			class:active={selectedPeriod === 'last-3-months'}
			onclick={() => handlePeriodChange('last-3-months')}
		>
			3 meses
		</button>
		<button
			type="button"
			class="pill"
			class:active={selectedPeriod === 'all'}
			onclick={() => handlePeriodChange('all')}
		>
			Todos
		</button>
	</div>

	<!-- Filtro de Categoría -->
	<div class="category-filter-row">
		<select
			class="cat-select"
			value={selectedCategory}
			onchange={handleCategoryChange}
		>
			<option value="">Todas las categorías</option>
			{#each data.categories as cat}
				<option value={cat.id}>{cat.name}</option>
			{/each}
		</select>
	</div>

	<!-- Lista agrupada de movimientos -->
	{#if data.movements.length === 0}
		<div class="empty-state card">
			<div class="empty-icon">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
			</div>
			<p class="empty-title">No hay movimientos encontrados</p>
			<p class="empty-sub">
				{searchQuery ? 'Prueba con otros términos de búsqueda o cambia el filtro de fecha.' : 'Empieza registrando un gasto o escaneando un ticket.'}
			</p>
		</div>
	{:else}
		<div class="movements-list">
			{#each groupedMovements as group}
				<div class="day-group">
					<div class="day-header">{group.dateLabel}</div>
					<div class="day-card card">
						{#each group.items as item, index}
							{#if index > 0}
								<div class="divider"></div>
							{/if}
							<a href="/movimientos/{item.id}" class="movement-item">
								<div class="item-left">
									<div class="item-icon" class:income={item.type === 'income'}>
										{#if item.source === 'ticket'}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<rect x="3" y="3" width="18" height="18" rx="2" />
												<line x1="7" y1="8" x2="17" y2="8" />
												<line x1="7" y1="12" x2="17" y2="12" />
												<line x1="7" y1="16" x2="13" y2="16" />
											</svg>
										{:else if item.type === 'income'}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="12" y1="19" x2="12" y2="5" />
												<polyline points="5 12 12 5 19 12" />
											</svg>
										{:else}
											<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<line x1="12" y1="5" x2="12" y2="19" />
												<polyline points="19 12 12 19 5 12" />
											</svg>
										{/if}
									</div>

									<div class="item-details">
										<span class="item-title">
											{item.merchant || item.note || (item.type === 'income' ? 'Ingreso' : 'Gasto')}
										</span>
										<div class="item-meta">
											<span class="item-category">{item.categoryName}</span>
											{#if item.itemsCount > 0}
												<span class="dot">•</span>
												<span class="item-items-tag">{item.itemsCount} art.</span>
											{/if}
										</div>
									</div>
								</div>

								<div class="item-right">
									<span class="item-amount" class:income-text={item.type === 'income'}>
										{item.type === 'income' ? '+' : '-'}{formatMoney(item.amountCents)}
									</span>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		{#if data.total > data.movements.length}
			<div class="load-more-row">
				<button type="button" class="btn-secondary w-full" onclick={loadMore}>
					Cargar más ({data.total - data.movements.length} restantes)
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.movimientos-page {
		padding-top: 0.5rem;
	}

	.header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.total-badge {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text-secondary);
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.search-icon {
		position: absolute;
		left: 0.875rem;
		color: var(--app-text-secondary);
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 0.625rem 2.25rem 0.625rem 2.5rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-xl);
		font-size: 0.9375rem;
		color: var(--app-text);
		outline: none;
		transition: border-color 150ms ease;

		&:focus {
			border-color: var(--color-primary-400);
		}
	}

	.clear-btn {
		position: absolute;
		right: 0.75rem;
		background: none;
		border: none;
		color: var(--app-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		font-size: 0.875rem;
	}

	.period-pills {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}
	}

	.pill {
		padding: 0.4375rem 0.875rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text-secondary);
		cursor: pointer;
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

	.category-filter-row {
		margin-bottom: 1.25rem;
	}

	.cat-select {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--card-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-lg);
		font-size: 0.8125rem;
		color: var(--app-text);
		outline: none;
		cursor: pointer;
	}

	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		margin-top: 1rem;
	}

	.empty-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4rem;
		height: 4rem;
		border-radius: 50%;
		background: var(--input-bg);
		color: var(--app-text-secondary);
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1.0625rem;
		font-weight: 700;
		margin-bottom: 0.375rem;
	}

	.empty-sub {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		line-height: 1.4;
	}

	.movements-list {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.day-header {
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: capitalize;
		color: var(--app-text-secondary);
		margin-bottom: 0.5rem;
		padding-left: 0.25rem;
	}

	.day-card {
		overflow: hidden;
	}

	.movement-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		text-decoration: none;
		color: var(--app-text);
		transition: background 150ms ease;
		min-height: 4rem;

		&:hover {
			background: var(--color-surface-100);
		}
	}

	.divider {
		height: 1px;
		background: var(--app-border);
		margin-left: 3.5rem;
	}

	.item-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
	}

	.item-icon {
		width: 2.375rem;
		height: 2.375rem;
		border-radius: var(--radius-lg);
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

	.item-details {
		min-width: 0;
	}

	.item-title {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		margin-top: 0.125rem;
	}

	.item-items-tag {
		background: var(--color-surface-200);
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		font-weight: 500;
	}

	.dot {
		color: var(--app-border);
	}

	.item-right {
		text-align: right;
		flex-shrink: 0;
		padding-left: 0.75rem;
	}

	.item-amount {
		font-size: 0.9375rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;

		&.income-text {
			color: var(--color-primary-600);
		}
	}

	.load-more-row {
		margin-top: 1.5rem;
	}

	.w-full {
		width: 100%;
	}
</style>
