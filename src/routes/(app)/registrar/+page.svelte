<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let type = $state(form?.values?.type ?? 'expense');
	let amount = $state(form?.values?.amount ?? '');
	let categoryId = $state(form?.values?.categoryId ?? data.quickChips[0]?.id ?? '');
	let subcategoryKey = $state(form?.values?.subcategoryKey ?? '');
	let date = $state(form?.values?.date ?? data.todayStr);
	let merchant = $state(form?.values?.merchant ?? '');
	let note = $state(form?.values?.note ?? '');
	let showMore = $state(
		!!(
			form?.values?.merchant ||
			form?.values?.note ||
			(form?.values?.date && form?.values?.date !== data.todayStr)
		)
	);
	let submitting = $state(false);

	// Filtrar categorías que no sean sistema
	const displayCategories = $derived(data.categories.filter((c) => !c.isSystem));
	const subcategories = $derived(data.subcategories ?? []);

	function subcatsForCategory(id) {
		if (!id) return [];
		return subcategories.filter((s) => s.categoryId === id);
	}

	function selectCategory(id) {
		categoryId = id;
		// Reiniciar subcategoría si ya no pertenece a la nueva categoría.
		if (!subcatsForCategory(id).some((s) => s.key === subcategoryKey)) {
			subcategoryKey = '';
		}
	}

	function onSubcategoryChange() {
		const sub = subcategories.find((s) => s.key === subcategoryKey);
		if (!sub) return;
		if (sub.categoryId) categoryId = sub.categoryId;
	}
</script>

<svelte:head>
	<title>Registrar movimiento — contlana</title>
</svelte:head>

<div class="register-page">
	<div class="top-bar">
		<a href="/" class="back-link" aria-label="Volver">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="page-title">Nuevo movimiento</h1>
		<div style="width: 2.5rem;"></div>
	</div>

	<form
		method="post"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="form"
	>
		<!-- Switch Tipo: Gasto / Ingreso -->
		<div class="type-switch">
			<button
				type="button"
				class="type-btn"
				class:active={type === 'expense'}
				onclick={() => (type = 'expense')}
			>
				Gasto
			</button>
			<button
				type="button"
				class="type-btn"
				class:active={type === 'income'}
				onclick={() => (type = 'income')}
			>
				Ingreso
			</button>
			<input type="hidden" name="type" value={type} />
		</div>

		<!-- Input de importe gigante -->
		<div class="amount-card card">
			<span class="currency-label">$</span>
			<input
				type="text"
				inputmode="decimal"
				name="amount"
				bind:value={amount}
				placeholder="0.00"
				class="amount-input"
				autofocus
				autocomplete="off"
				required
			/>
			<span class="currency-code">MXN</span>
		</div>

		{#if form?.error}
			<div class="error-banner">
				{form.error}
			</div>
		{/if}

		<!-- Categorías (solo para gastos) -->
		{#if type === 'expense'}
			<div class="section">
				<div class="section-header">
					<label for="categoryIdSelect" class="section-label">Categoría</label>
					<span class="section-sub">Un toque para elegir</span>
				</div>

				<!-- Chips rápidos -->
				<div class="chips-grid">
					{#each data.quickChips as chip}
						<button
							type="button"
							class="chip-btn"
							class:selected={categoryId === chip.id}
							onclick={() => selectCategory(chip.id)}
						>
							{#if chip.isFavorite}
								<span class="star-icon">★</span>
							{/if}
							<span>{chip.name}</span>
						</button>
					{/each}
				</div>

				<!-- Selector dropdown para ver todas las categorías -->
				<div class="select-wrapper">
					<select
						id="categoryIdSelect"
						name="categoryId"
						bind:value={categoryId}
						onchange={() => selectCategory(categoryId)}
						class="category-select"
					>
						<option value="" disabled>O elige de la lista completa...</option>
						{#each displayCategories as cat}
							<option value={cat.id}>
								{cat.parentId ? '— ' : ''}{cat.name}
							</option>
						{/each}
					</select>
					<div class="select-arrow">
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</div>
				</div>

				<!-- Subcategoría (opcional), coherente con la categoría elegida -->
				<div class="select-wrapper">
					<select
						id="subcategoryKeySelect"
						name="subcategoryKey"
						bind:value={subcategoryKey}
						onchange={onSubcategoryChange}
						class="category-select"
					>
						<option value="">Subcategoría (pendiente de revisión)</option>
						{#each subcatsForCategory(categoryId) as sub (sub.key)}
							<option value={sub.key}>{sub.name}</option>
						{/each}
					</select>
					<div class="select-arrow">
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</div>
				</div>
			</div>
		{/if}

		<!-- Más opciones (colapsable) -->
		<div class="more-section">
			<button type="button" class="more-toggle" onclick={() => (showMore = !showMore)}>
				<span>{showMore ? 'Menos opciones' : 'Más opciones (comercio, nota, fecha)'}</span>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					style="transform: rotate({showMore ? 180 : 0}deg); transition: transform 200ms;"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>

			{#if showMore}
				<div class="more-fields card">
					<div class="field">
						<label for="merchant" class="field-label">Comercio o lugar</label>
						<input
							type="text"
							id="merchant"
							name="merchant"
							bind:value={merchant}
							placeholder="Ej. Oxxo, Starbucks, Tiendita"
							class="input-field"
						/>
					</div>

					<div class="field">
						<label for="date" class="field-label">Fecha</label>
						<input type="date" id="date" name="date" bind:value={date} class="input-field" />
					</div>

					<div class="field">
						<label for="note" class="field-label">Nota o descripción</label>
						<input
							type="text"
							id="note"
							name="note"
							bind:value={note}
							placeholder="Ej. Antojo de la tarde"
							class="input-field"
						/>
					</div>
				</div>
			{/if}
		</div>

		<!-- Botón guardar -->
		<div class="submit-wrapper">
			<button type="submit" class="save-btn btn-primary w-full" disabled={submitting}>
				{submitting ? 'Guardando...' : 'Guardar movimiento'}
			</button>
		</div>
	</form>
</div>

<style>
	.register-page {
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
		transition: background 150ms ease;

		&:hover {
			background: var(--color-surface-200);
		}
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 700;
	}

	.type-switch {
		display: flex;
		background: var(--input-bg);
		padding: 0.25rem;
		border-radius: var(--radius-xl);
		margin-bottom: 1.25rem;
	}

	.type-btn {
		flex: 1;
		padding: 0.625rem;
		border-radius: var(--radius-lg);
		border: none;
		background: transparent;
		font-weight: 600;
		font-size: 0.9375rem;
		color: var(--app-text-secondary);
		cursor: pointer;
		transition: all 150ms ease;

		&.active {
			background: var(--card-bg);
			color: var(--app-text);
			box-shadow: var(--shadow-card);
		}
	}

	.amount-card {
		display: flex;
		align-items: center;
		padding: 1.25rem 1.5rem;
		margin-bottom: 1.25rem;
	}

	.currency-label {
		font-size: 2.25rem;
		font-weight: 800;
		color: var(--app-text-secondary);
		margin-right: 0.5rem;
	}

	.amount-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 2.75rem;
		font-weight: 800;
		color: var(--app-text);
		outline: none;
		font-variant-numeric: tabular-nums;
		min-width: 0;

		&::placeholder {
			color: var(--color-surface-300);
		}
	}

	.currency-code {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--app-text-secondary);
		margin-left: 0.75rem;
	}

	.error-banner {
		background: var(--color-danger-50);
		border: 1px solid var(--color-danger-200);
		color: var(--color-danger-600);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 1.25rem;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.section-label {
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--app-text);
	}

	.section-sub {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
	}

	.chips-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.chip-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--app-text);
		cursor: pointer;
		transition: all 150ms ease;
		min-height: 2.375rem;

		&:hover {
			background: var(--color-surface-200);
		}

		&.selected {
			background: var(--color-primary-500);
			border-color: var(--color-primary-500);
			color: white;
		}
	}

	.star-icon {
		color: #f59e0b;
		font-size: 0.75rem;
	}

	.select-wrapper {
		position: relative;
		margin-top: 0.5rem;
	}

	.category-select {
		width: 100%;
		padding: 0.625rem 2.25rem 0.625rem 0.875rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		color: var(--app-text);
		outline: none;
		appearance: none;
		cursor: pointer;

		&:focus {
			border-color: var(--color-primary-400);
		}
	}

	.select-arrow {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		color: var(--app-text-secondary);
	}

	.more-section {
		margin-bottom: 1.5rem;
	}

	.more-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-primary-600);
		cursor: pointer;
		padding: 0.5rem 0;
	}

	.more-fields {
		padding: 1.25rem;
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text);
	}

	.submit-wrapper {
		margin-top: 1rem;
	}

	.save-btn {
		font-size: 1rem;
		height: 3.25rem;
		border-radius: var(--radius-xl);
	}

	.w-full {
		width: 100%;
	}
</style>
