<script>
	import { enhance } from '$app/forms';
	import { formatMoney, parseAmountToCents } from '$lib/utils/money.js';
	import { remainingFromIncome, budgetUsedPct, lineProgressPct } from '$lib/utils/budget-math.js';

	let { data, form } = $props();

	let income = $state(data.incomePesos);
	let lines = $state(
		data.lines.map((l) => ({
			key: l.key,
			categoryId: l.categoryId,
			name: l.name,
			isCustom: !!l.isCustom,
			general: l.plannedPesos,
			spentCents: l.spentCents,
			generalSpentCents: l.generalSpentCents,
			expanded: false,
			newSubName: '',
			subcategories: (l.subcategories ?? []).map((s) => ({
				id: s.id ?? null,
				key: s.key,
				name: s.name,
				isCustom: !!s.isCustom,
				amount: s.plannedPesos,
				spentCents: s.spentCents
			}))
		}))
	);

	let pickerOpen = $state(false);
	let newName = $state('');
	let saving = $state(false);

	let available = $derived(
		data.categories.filter((c) => !lines.some((l) => l.categoryId === c.id))
	);

	function toCents(value) {
		return parseAmountToCents(String(value ?? '')) ?? 0;
	}

	function catPlanned(line) {
		return toCents(line.general) + line.subcategories.reduce((t, s) => t + toCents(s.amount), 0);
	}

	let plannedCents = $derived(lines.reduce((total, l) => total + catPlanned(l), 0));
	let incomeCents = $derived(
		income === '' || income === null || income === undefined
			? null
			: parseAmountToCents(String(income))
	);
	let remaining = $derived(remainingFromIncome(incomeCents, plannedCents));
	let usedPct = $derived(budgetUsedPct(plannedCents, incomeCents));

	function toggle(line) {
		line.expanded = !line.expanded;
	}

	function removeCategory(key) {
		lines = lines.filter((l) => l.key !== key);
	}

	function addCategory(cat) {
		if (lines.some((l) => l.categoryId === cat.id)) return;
		lines = [
			...lines,
			{
				key: cat.id,
				categoryId: cat.id,
				name: cat.name,
				isCustom: !!cat.isCustom,
				general: '',
				spentCents: 0,
				generalSpentCents: 0,
				expanded: true,
				newSubName: '',
				subcategories: (cat.subcategories ?? []).map((s) => ({
					id: s.id ?? null,
					key: s.key,
					name: s.name,
					isCustom: !!s.isCustom,
					amount: '',
					spentCents: 0
				}))
			}
		];
		pickerOpen = false;
	}

	// Al crear una categoría real en el servidor, la agregamos al presupuesto.
	async function createCategoryEnhance({ result, update }) {
		await update();
		if (result.type === 'success') {
			const newId = result.data?.createdCategoryId;
			const cat = newId ? data.categories.find((c) => c.id === newId) : null;
			if (cat) addCategory(cat);
			newName = '';
		}
	}

	// Categorías personalizadas del usuario (para poder borrarlas).
	let customCategories = $derived(data.categories.filter((c) => c.isCustom));

	// Al borrar una categoría/subcategoría personalizada, limpiamos el estado
	// local para no dejar líneas huérfanas.
	async function deleteCustomEnhance({ result, update }) {
		await update();
		if (result.type === 'success') {
			const id = result.data?.deletedId;
			if (id) {
				lines = lines
					.filter((l) => l.categoryId !== id)
					.map((l) => ({ ...l, subcategories: l.subcategories.filter((s) => s.id !== id) }));
			}
		}
	}

	function confirmDelete(name) {
		return window.confirm(
			`¿Eliminar "${name}"? Los movimientos que la usaban pasarán a "Sin clasificar".`
		);
	}

	// Al crear una subcategoría personalizada, la agregamos a su categoría.
	async function createSubEnhance({ result, update }) {
		await update();
		if (result.type === 'success') {
			const sub = result.data?.createdSubcategory;
			if (sub) {
				const line = lines.find((l) => l.categoryId === sub.categoryId);
				if (line) {
					if (!line.subcategories.some((s) => s.key === sub.key)) {
						line.subcategories = [
							...line.subcategories,
							{
								id: sub.id,
								key: sub.key,
								name: sub.name,
								isCustom: true,
								amount: '',
								spentCents: 0
							}
						];
					}
					line.newSubName = '';
				}
			}
		}
	}
</script>

<svelte:head>
	<title>Presupuesto — contlana</title>
</svelte:head>

<div class="budget-page">
	<header class="header">
		<h1 class="page-title">Presupuesto</h1>
		<p class="subtitle">
			Asigna cuánto piensas gastar al mes. Toca una categoría para detallar por subcategoría. Son
			gastos <strong>planeados</strong>, distintos de los gastos reales.
		</p>
	</header>

	{#if form?.error}
		<div class="error-banner card">
			<p>{form.error}</p>
		</div>
	{/if}

	{#if form?.savedBudget}
		<div class="success-banner card">Presupuesto guardado correctamente</div>
	{/if}

	<form
		method="post"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update();
			};
		}}
	>
		<!-- Resumen: ingreso, planeado y disponible -->
		<div class="summary-card card">
			<div class="income-field">
				<label for="monthlyIncome" class="field-label">Ingreso mensual ($ MXN)</label>
				<input
					type="text"
					inputmode="decimal"
					id="monthlyIncome"
					name="monthlyIncome"
					bind:value={income}
					placeholder="Ej. 18000"
					class="input-field"
				/>
			</div>

			<div class="summary-grid">
				<div class="summary-item">
					<span class="summary-label">Planeado</span>
					<span class="summary-value planned">{formatMoney(plannedCents)}</span>
				</div>
				<div class="summary-item">
					<span class="summary-label">Te quedaría</span>
					{#if remaining === null}
						<span class="summary-value muted">—</span>
					{:else}
						<span
							class="summary-value"
							class:positive={remaining >= 0}
							class:negative={remaining < 0}
						>
							{formatMoney(remaining)}
						</span>
					{/if}
				</div>
			</div>

			{#if usedPct !== null}
				<div class="progress-track">
					<div
						class="progress-bar"
						class:over={usedPct > 100}
						style="width: {Math.min(usedPct, 100)}%;"
					></div>
				</div>
				<p class="summary-hint">{usedPct}% de tu ingreso está planeado</p>
			{:else}
				<p class="summary-hint">
					Escribe tu ingreso mensual para ver cuánto te quedaría disponible.
				</p>
			{/if}
		</div>

		<!-- Categorías (expandibles a subcategorías) -->
		{#if lines.length === 0}
			<div class="empty-state card">
				<div class="empty-icon-circle">
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
					>
						<path d="M3 3v18h18" />
						<path d="M7 14l4-4 3 3 5-6" />
					</svg>
				</div>
				<h3 class="empty-heading">No tienes categorías en el presupuesto</h3>
				<p class="empty-desc">
					Usa “Añadir categoría” para crear una nueva o volver a incluir las que quieras
					presupuestar este mes.
				</p>
			</div>
		{:else}
			<div class="cat-list">
				{#each lines as line (line.key)}
					<div class="cat-block card">
						<div class="cat-head">
							{#if line.subcategories.length > 0}
								<button
									type="button"
									class="cat-toggle"
									onclick={() => toggle(line)}
									aria-expanded={line.expanded}
								>
									<span class="chevron" class:open={line.expanded}>›</span>
									<span class="cat-name">{line.name}</span>
								</button>
							{:else}
								<span class="cat-name" class:custom={line.isCustom}>{line.name}</span>
							{/if}

							<div class="cat-head-right">
								{#if line.subcategories.length > 0}
									<span class="cat-total">{formatMoney(catPlanned(line))}</span>
								{:else}
									<div class="line-inputs">
										<span class="currency-prefix">$</span>
										<input
											type="text"
											inputmode="decimal"
											name="general|{line.categoryId}"
											bind:value={line.general}
											placeholder="0"
											class="amount-input"
											aria-label="Monto de {line.name}"
										/>
									</div>
								{/if}
								<button
									type="button"
									class="remove-btn"
									onclick={() => removeCategory(line.key)}
									aria-label="Quitar {line.name} del presupuesto"
								>
									✕
								</button>
							</div>
						</div>

						<div class="cat-meta">
							<span class="cat-real">Real este mes: {formatMoney(line.spentCents)}</span>
							{#if line.isCustom}
								<span class="custom-tag">Personalizada</span>
							{/if}
							{#if catPlanned(line) > 0 && line.spentCents > 0}
								{#if catPlanned(line) - line.spentCents >= 0}
									<span class="diff ok">
										Disponible: {formatMoney(catPlanned(line) - line.spentCents)}
									</span>
								{:else}
									<span class="diff over">
										Excedido: {formatMoney(line.spentCents - catPlanned(line))}
									</span>
								{/if}
							{/if}
						</div>

						{#if line.subcategories.length > 0}
							{#if catPlanned(line) > 0}
								<div class="cat-track">
									<div
										class="cat-bar"
										class:over={lineProgressPct(line.spentCents, catPlanned(line)) > 100}
										style="width: {Math.min(
											lineProgressPct(line.spentCents, catPlanned(line)),
											100
										)}%;"
									></div>
								</div>
							{/if}

							<div class="subs" class:collapsed={!line.expanded}>
								<div class="sub-row general">
									<div class="sub-label">
										<span class="sub-name">General (sin subcategoría)</span>
										<span class="sub-real">Real: {formatMoney(line.generalSpentCents)}</span>
									</div>
									<div class="line-inputs">
										<span class="currency-prefix">$</span>
										<input
											type="text"
											inputmode="decimal"
											name="general|{line.categoryId}"
											bind:value={line.general}
											placeholder="0"
											class="amount-input"
											aria-label="Monto general de {line.name}"
										/>
									</div>
								</div>

								{#each line.subcategories as sub (sub.key)}
									<div class="sub-row">
										<div class="sub-label">
											<span class="sub-name">
												{sub.name}
												{#if sub.isCustom}<span class="custom-tag">Personalizada</span>{/if}
											</span>
											<span class="sub-real">Real: {formatMoney(sub.spentCents)}</span>
										</div>
										<div class="line-inputs">
											<span class="currency-prefix">$</span>
											<input
												type="text"
												inputmode="decimal"
												name="sub|{line.categoryId}|{sub.key}"
												bind:value={sub.amount}
												placeholder="0"
												class="amount-input"
												aria-label="Monto de {sub.name}"
											/>
											{#if sub.isCustom}
												<button
													type="submit"
													form="deleteCustomForm"
													name="id"
													value={sub.id}
													class="icon-delete"
													title="Eliminar subcategoría"
													aria-label="Eliminar subcategoría {sub.name}"
													onclick={(e) => {
														if (!confirmDelete(sub.name)) e.preventDefault();
													}}
												>
													✕
												</button>
											{/if}
										</div>
									</div>
								{/each}

								<div class="sub-row add-sub-row">
									<input
										type="text"
										name="name"
										form="createSubForm-{line.categoryId}"
										bind:value={line.newSubName}
										placeholder="Nueva subcategoría…"
										class="sub-new-input input-field"
										maxlength="60"
										aria-label="Nueva subcategoría para {line.name}"
									/>
									<button
										type="submit"
										form="createSubForm-{line.categoryId}"
										class="add-sub-btn"
										disabled={line.newSubName.trim() === ''}
									>
										Agregar
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Añadir categoría -->
		<div class="add-section">
			<button
				type="button"
				class="btn-secondary w-full"
				onclick={() => (pickerOpen = !pickerOpen)}
				aria-expanded={pickerOpen}
			>
				+ Añadir categoría
			</button>

			{#if pickerOpen}
				<div class="add-panel card">
					<p class="panel-label">Crear una categoría nueva</p>
					<div class="new-cat-row">
						<input
							type="text"
							name="name"
							form="createCategoryForm"
							bind:value={newName}
							placeholder="Ej. Renta, Colegiatura…"
							class="input-field"
							maxlength="60"
							aria-label="Nombre de la categoría nueva"
						/>
						<button
							type="submit"
							form="createCategoryForm"
							class="create-btn btn-primary"
							disabled={newName.trim() === ''}
						>
							Crear
						</button>
					</div>

					{#if available.length > 0}
						<p class="panel-label picker-heading">O vuelve a agregar del catálogo</p>
						<div class="picker">
							{#each available as cat (cat.id)}
								<button type="button" class="picker-item" onclick={() => addCategory(cat)}>
									{cat.name}
								</button>
							{/each}
						</div>
					{/if}

					{#if customCategories.length > 0}
						<p class="panel-label picker-heading">Tus categorías personalizadas</p>
						<div class="picker">
							{#each customCategories as cat (cat.id)}
								<div class="custom-manage">
									<span class="custom-manage-name">{cat.name}</span>
									<button
										type="submit"
										form="deleteCustomForm"
										name="id"
										value={cat.id}
										class="icon-delete"
										title="Eliminar categoría"
										aria-label="Eliminar categoría {cat.name}"
										onclick={(e) => {
											if (!confirmDelete(cat.name)) e.preventDefault();
										}}
									>
										✕
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<button type="submit" class="save-btn btn-primary w-full" disabled={saving}>
			{saving ? 'Guardando...' : 'Guardar presupuesto'}
		</button>
	</form>

	<!-- Formulario aparte para crear categorías (asociado por el atributo `form`) -->
	<form
		id="createCategoryForm"
		method="post"
		action="?/createCategory"
		use:enhance={() => createCategoryEnhance}
	></form>

	<!-- Formulario aparte para borrar categorías/subcategorías personalizadas -->
	<form
		id="deleteCustomForm"
		method="post"
		action="?/deleteCustom"
		use:enhance={() => deleteCustomEnhance}
	></form>

	<!-- Un formulario por categoría para crear subcategorías personalizadas -->
	{#each lines as line (line.key)}
		<form
			id="createSubForm-{line.categoryId}"
			method="post"
			action="?/createSubcategory"
			use:enhance={() => createSubEnhance}
		>
			<input type="hidden" name="categoryId" value={line.categoryId} />
		</form>
	{/each}
</div>

<style>
	.budget-page {
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
		line-height: 1.5;
	}

	.error-banner {
		padding: 0.875rem 1rem;
		background: var(--color-danger-50);
		border-color: var(--color-danger-200);
		color: var(--color-danger-600);
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 1.25rem;
	}

	.success-banner {
		padding: 0.75rem 1rem;
		background: var(--color-primary-50);
		color: var(--color-primary-700);
		border-color: var(--color-primary-200);
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 1.25rem;
		text-align: center;
	}

	.summary-card {
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.income-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 1rem;
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.875rem;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.summary-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--app-text-secondary);
	}

	.summary-value {
		font-size: 1.25rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;

		&.planned {
			color: var(--app-text);
		}

		&.positive {
			color: var(--color-primary-600);
		}

		&.negative {
			color: var(--color-danger-500);
		}

		&.muted {
			color: var(--app-text-secondary);
		}
	}

	.progress-track {
		width: 100%;
		height: 0.5rem;
		background: var(--input-bg);
		border-radius: var(--radius-full);
		overflow: hidden;
		margin-bottom: 0.375rem;
	}

	.progress-bar {
		height: 100%;
		background: var(--color-primary-500);
		border-radius: var(--radius-full);
		transition: width 300ms ease;

		&.over {
			background: var(--color-danger-500);
		}
	}

	.summary-hint {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
	}

	.cat-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.cat-block {
		overflow: hidden;
	}

	.cat-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.875rem 1rem 0.375rem;
	}

	.cat-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--app-text);
		text-align: left;
	}

	.chevron {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		font-size: 1.125rem;
		color: var(--app-text-secondary);
		transition: transform 150ms ease;

		&.open {
			transform: rotate(90deg);
		}
	}

	.cat-name {
		font-size: 0.9375rem;
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

		&.custom {
			color: var(--color-primary-600);
		}
	}

	.custom-tag {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-primary-600);
		background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
		padding: 0.0625rem 0.375rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.cat-head-right {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	.cat-total {
		font-size: 0.9375rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.remove-btn {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: var(--radius-md);
		color: var(--app-text-secondary);
		font-size: 0.875rem;
		cursor: pointer;

		&:hover {
			background: var(--color-danger-50);
			color: var(--color-danger-500);
		}
	}

	.cat-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 1rem 0.625rem;
	}

	.cat-real {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
	}

	.diff {
		font-size: 0.6875rem;
		font-weight: 700;
		padding: 0.0625rem 0.375rem;
		border-radius: var(--radius-sm);

		&.ok {
			color: var(--color-primary-700);
			background: var(--color-primary-50);
		}

		&.over {
			color: var(--color-danger-600);
			background: var(--color-danger-50);
		}
	}

	.cat-track {
		width: 100%;
		height: 0.25rem;
		background: var(--input-bg);
		overflow: hidden;
	}

	.cat-bar {
		height: 100%;
		background: var(--color-primary-400);
		transition: width 300ms ease;

		&.over {
			background: var(--color-danger-500);
		}
	}

	.subs {
		border-top: 1px solid var(--app-border);
		background: var(--input-bg);

		&.collapsed {
			display: none;
		}
	}

	.sub-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 1rem 0.5rem 2.25rem;

		& + & {
			border-top: 1px solid var(--app-border);
		}

		&.general .sub-name {
			font-weight: 600;
		}
	}

	.sub-label {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		min-width: 0;
	}

	.sub-name {
		font-size: 0.8125rem;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sub-real {
		font-size: 0.6875rem;
		color: var(--app-text-secondary);
	}

	.add-sub-row {
		padding-top: 0.625rem;
		padding-bottom: 0.625rem;
	}

	.sub-new-input {
		flex: 1;
		min-width: 0;
		font-size: 0.8125rem;
		padding: 0.4375rem 0.625rem;
	}

	.add-sub-btn {
		flex-shrink: 0;
		padding: 0.4375rem 0.75rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-primary-700);
		cursor: pointer;
		transition: all 150ms ease;

		&:hover:not(:disabled) {
			background: var(--color-primary-50);
			border-color: var(--color-primary-300);
		}

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}

	.line-inputs {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	.currency-prefix {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--app-text-secondary);
	}

	.amount-input {
		width: 6rem;
		padding: 0.4375rem 0.625rem;
		background: var(--card-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-md);
		font-size: 0.9375rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: right;
		color: var(--app-text);
		outline: none;

		&:focus {
			border-color: var(--color-primary-400);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary-400) 20%, transparent);
		}
	}

	.add-section {
		margin-bottom: 1.25rem;
	}

	.add-panel {
		padding: 0.875rem;
		margin-top: 0.75rem;
	}

	.panel-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--app-text-secondary);
		margin-bottom: 0.5rem;
	}

	.picker-heading {
		margin-top: 0.875rem;
	}

	.new-cat-row {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
	}

	.new-cat-row .input-field {
		flex: 1;
		min-width: 0;
	}

	.create-btn {
		flex-shrink: 0;
	}

	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.picker-item {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.875rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--app-text);
		cursor: pointer;
		transition: all 150ms ease;
		min-height: 2.25rem;

		&:hover {
			background: var(--color-primary-50);
			border-color: var(--color-primary-300);
			color: var(--color-primary-700);
		}
	}

	.custom-manage {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.375rem 0.25rem 0.875rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-full);
		min-height: 2.25rem;
	}

	.custom-manage-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--app-text);
	}

	.icon-delete {
		width: 1.625rem;
		height: 1.625rem;
		min-width: 1.625rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: none;
		border: none;
		border-radius: 999px;
		color: var(--app-text-secondary);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 150ms ease;

		&:hover {
			background: var(--color-danger-50);
			color: var(--color-danger-500);
		}
	}

	.save-btn {
		margin-bottom: 2rem;
	}

	.empty-state {
		padding: 2rem 1.5rem;
		text-align: center;
		margin-bottom: 1.25rem;
	}

	.empty-icon-circle {
		width: 3.25rem;
		height: 3.25rem;
		border-radius: 50%;
		background: var(--color-primary-50);
		color: var(--color-primary-600);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 0.875rem;
	}

	.empty-heading {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 0.375rem;
	}

	.empty-desc {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
	}

	.w-full {
		width: 100%;
	}
</style>
