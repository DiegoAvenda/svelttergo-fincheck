<script>
	import { enhance } from '$app/forms';
	import { formatMoney } from '$lib/utils/money.js';

	let { data, form } = $props();

	let merchant = $state(data.movement.merchant);
	let note = $state(data.movement.note);
	let date = $state(data.movement.date);
	let categoryId = $state(data.movement.categoryId);
	let subcategoryKey = $state(data.movement.subcategoryKey || '');
	let items = $state(data.movement.items);

	let isEditing = $state(false);
	let showDeleteConfirm = $state(false);
	let saving = $state(false);

	const subcategories = $derived(data.subcategories ?? []);

	function subcatsForCategory(catId) {
		if (!catId) return [];
		return subcategories.filter((s) => s.categoryId === catId);
	}

	function onCategoryChange() {
		if (!subcatsForCategory(categoryId).some((s) => s.key === subcategoryKey)) {
			subcategoryKey = '';
		}
	}

	function onSubcategoryChange() {
		const sub = subcategories.find((s) => s.key === subcategoryKey);
		if (!sub || !sub.categoryId) return;
		categoryId = sub.categoryId;
	}

	function onItemCategoryChange(item) {
		if (!subcatsForCategory(item.categoryId).some((s) => s.key === item.subcategoryKey)) {
			item.subcategoryKey = '';
		}
	}

	function onItemSubcategoryChange(item) {
		const sub = subcategories.find((s) => s.key === item.subcategoryKey);
		if (!sub || !sub.categoryId) return;
		item.categoryId = sub.categoryId;
	}
</script>

<svelte:head>
	<title>{data.movement.merchant || 'Movimiento'} — contlana</title>
</svelte:head>

<div class="detail-page">
	<div class="top-bar">
		<a href="/movimientos" class="back-link" aria-label="Volver a movimientos">
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
		</a>
		<h1 class="page-title">Detalle de movimiento</h1>
		<button
			type="button"
			class="action-btn"
			onclick={() => (isEditing = !isEditing)}
			aria-label="Editar"
		>
			{isEditing ? 'Cancelar' : 'Editar'}
		</button>
	</div>

	{#if form?.success}
		<div class="success-banner">Cambios guardados correctamente</div>
	{/if}

	<div class="hero-card card">
		<div class="hero-type-badge" class:income={data.movement.type === 'income'}>
			{data.movement.type === 'income' ? 'Ingreso' : 'Gasto'}
			{#if data.movement.source === 'ticket'}
				• Ticket de compra
			{/if}
		</div>

		<div class="hero-amount" class:income-text={data.movement.type === 'income'}>
			{data.movement.type === 'income' ? '+' : '-'}{formatMoney(data.movement.amountCents)}
		</div>

		{#if data.movement.merchant}
			<div class="hero-merchant">{data.movement.merchant}</div>
		{/if}
		<div class="hero-date">{data.movement.date}</div>
	</div>

	<!-- Formulario de edición o vista -->
	<form
		method="post"
		action="?/update"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				isEditing = false;
				await update();
			};
		}}
		class="form"
	>
		<div class="info-card card">
			<h2 class="section-title">Datos generales</h2>

			<div class="field-row">
				<span class="field-label">Comercio:</span>
				{#if isEditing}
					<input type="text" name="merchant" bind:value={merchant} class="input-inline" />
				{:else}
					<span class="field-value">{data.movement.merchant || '—'}</span>
				{/if}
			</div>

			<div class="divider"></div>

			<div class="field-row">
				<span class="field-label">Fecha:</span>
				{#if isEditing}
					<input type="date" name="date" bind:value={date} class="input-inline" />
				{:else}
					<span class="field-value">{data.movement.date}</span>
				{/if}
			</div>

			<div class="divider"></div>

			{#if data.movement.items.length === 0}
				<div class="field-row">
					<span class="field-label">Categoría:</span>
					{#if isEditing}
						<select
							name="categoryId"
							bind:value={categoryId}
							onchange={onCategoryChange}
							class="select-inline"
						>
							{#each data.categories as cat}
								<option value={cat.id}>{cat.parentId ? '— ' : ''}{cat.name}</option>
							{/each}
						</select>
					{:else}
						<span class="field-value">{data.movement.categoryName}</span>
					{/if}
				</div>

				<div class="field-row">
					<span class="field-label">Subcategoría:</span>
					{#if isEditing}
						<select
							name="subcategoryKey"
							bind:value={subcategoryKey}
							onchange={onSubcategoryChange}
							class="select-inline"
						>
							<option value="">Pendiente de revisión</option>
							{#each subcatsForCategory(categoryId) as sub (sub.key)}
								<option value={sub.key}>{sub.name}</option>
							{/each}
						</select>
					{:else}
						<span class="field-value">
							{data.movement.subcategoryName || 'Pendiente de revisión'}
						</span>
					{/if}
				</div>
				<div class="divider"></div>
			{/if}

			<div class="field-row">
				<span class="field-label">Nota:</span>
				{#if isEditing}
					<input
						type="text"
						name="note"
						bind:value={note}
						class="input-inline"
						placeholder="Agregar nota..."
					/>
				{:else}
					<span class="field-value">{data.movement.note || '—'}</span>
				{/if}
			</div>
		</div>

		<!-- Desglose de artículos del ticket si existen -->
		{#if data.movement.items.length > 0}
			<div class="items-card card">
				<div class="items-header">
					<h2 class="section-title">Artículos del ticket ({data.movement.items.length})</h2>
					<span class="items-hint">Categoría asignada a cada producto</span>
				</div>

				<div class="items-list">
					{#each items as item, index}
						{#if index > 0}
							<div class="divider"></div>
						{/if}
						<div class="item-row">
							<div class="item-info">
								<span class="item-desc">{item.originalDescription}</span>
								<div class="item-cat-selector">
									{#if isEditing}
										<select
											name="item_cat_{index}"
											bind:value={item.categoryId}
											onchange={() => onItemCategoryChange(item)}
											class="select-small"
										>
											<option value="">Sin clasificar</option>
											{#each data.categories as cat}
												<option value={cat.id}>{cat.name}</option>
											{/each}
										</select>
										<select
											name="item_subcat_{index}"
											bind:value={item.subcategoryKey}
											onchange={() => onItemSubcategoryChange(item)}
											class="select-small"
										>
											<option value="">Pendiente de revisión</option>
											{#each subcatsForCategory(item.categoryId) as sub (sub.key)}
												<option value={sub.key}>{sub.name}</option>
											{/each}
										</select>
									{:else}
										<span class="cat-tag" class:unclassified={!item.categoryId}>
											{item.categoryName}
										</span>
										{#if item.subcategoryName}
											<span class="cat-tag sub">{item.subcategoryName}</span>
										{:else}
											<span class="cat-tag unclassified">Pendiente de revisión</span>
										{/if}
									{/if}
								</div>
							</div>
							<div class="item-price">
								{formatMoney(item.amountCents)}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if isEditing}
			<div class="save-bar">
				<button type="submit" class="btn-primary w-full" disabled={saving}>
					{saving ? 'Guardando...' : 'Guardar cambios'}
				</button>
			</div>
		{/if}
	</form>

	<!-- Botón eliminar -->
	<div class="delete-section">
		{#if showDeleteConfirm}
			<div class="delete-confirm-box card">
				<p class="confirm-text">¿Seguro que deseas eliminar este movimiento?</p>
				<div class="confirm-actions">
					<button type="button" class="btn-secondary" onclick={() => (showDeleteConfirm = false)}>
						Cancelar
					</button>
					<form method="post" action="?/delete" use:enhance>
						<button type="submit" class="btn-danger"> Sí, eliminar </button>
					</form>
				</div>
			</div>
		{:else}
			<button type="button" class="delete-trigger-btn" onclick={() => (showDeleteConfirm = true)}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<polyline points="3 6 5 6 21 6" />
					<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
				</svg>
				<span>Eliminar movimiento</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.detail-page {
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

	.action-btn {
		background: none;
		border: none;
		color: var(--color-primary-600);
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		padding: 0.5rem;
	}

	.success-banner {
		background: var(--color-primary-50);
		color: var(--color-primary-700);
		border: 1px solid var(--color-primary-200);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 1rem;
		text-align: center;
	}

	.hero-card {
		padding: 1.5rem;
		text-align: center;
		margin-bottom: 1.25rem;
	}

	.hero-type-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-full);
		background: var(--color-surface-200);
		color: var(--app-text-secondary);
		margin-bottom: 0.5rem;

		&.income {
			background: var(--color-primary-100);
			color: var(--color-primary-600);
		}
	}

	.hero-amount {
		font-size: 2.25rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		margin-bottom: 0.25rem;

		&.income-text {
			color: var(--color-primary-600);
		}
	}

	.hero-merchant {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--app-text);
	}

	.hero-date {
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		margin-top: 0.25rem;
	}

	.info-card,
	.items-card {
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0;
		gap: 1rem;
	}

	.field-label {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
	}

	.field-value {
		font-size: 0.875rem;
		font-weight: 600;
		text-align: right;
	}

	.input-inline,
	.select-inline {
		padding: 0.375rem 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		color: var(--app-text);
		text-align: right;
	}

	.divider {
		height: 1px;
		background: var(--app-border);
	}

	.items-header {
		margin-bottom: 1rem;
	}

	.items-hint {
		display: block;
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		margin-top: -0.5rem;
		margin-bottom: 0.75rem;
	}

	.item-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0;
		gap: 0.75rem;
	}

	.item-info {
		min-width: 0;
		flex: 1;
	}

	.item-desc {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--app-text);
		word-break: break-word;
	}

	.cat-tag {
		display: inline-block;
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: var(--color-surface-200);
		color: var(--app-text-secondary);
		border-radius: var(--radius-sm);
		margin-top: 0.25rem;

		&.unclassified {
			background: var(--color-accent-100);
			color: var(--color-accent-800);
		}

		&.sub {
			background: var(--input-bg);
			color: var(--app-text);
		}
	}

	.item-cat-selector {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.select-small {
		margin-top: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		color: var(--app-text);
	}

	.item-price {
		font-size: 0.875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.save-bar {
		margin-bottom: 1.5rem;
	}

	.delete-section {
		margin-top: 1.5rem;
		margin-bottom: 2rem;
		text-align: center;
	}

	.delete-trigger-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		color: var(--color-danger-500);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0.5rem 1rem;
	}

	.delete-confirm-box {
		padding: 1.25rem;
		text-align: center;
	}

	.confirm-text {
		font-size: 0.9375rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.confirm-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}

	.w-full {
		width: 100%;
	}
</style>
