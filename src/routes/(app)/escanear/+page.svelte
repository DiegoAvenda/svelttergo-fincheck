<script>
	import { enhance } from '$app/forms';
	import { formatMoney, centsToPesos } from '$lib/utils/money.js';

	let { data, form } = $props();

	// Estados: 'capturar' | 'procesando' | 'revision'
	let state = $state(form?.draft ? 'revision' : 'capturar');
	let isUploading = $state(false);
	let isSaving = $state(false);

	// Campos del borrador
	let merchant = $state(form?.draft?.merchant ?? '');
	let date = $state(form?.draft?.date ?? '');
	let totalPesos = $state(
		form?.draft?.totalCents ? String(centsToPesos(form?.draft?.totalCents)) : ''
	);
	let items = $state(
		form?.draft?.items
			? form.draft.items.map((it) => ({ ...it, amountPesos: String(centsToPesos(it.amountCents)) }))
			: []
	);

	let onlyTotal = $state(false);
	let singleCategoryId = $state(
		data.categories.find((c) => !c.isSystem)?.id || data.categories[0]?.id || ''
	);
	let singleSubcategoryKey = $state('');

	// Catálogo fijo de subcategorías y utilidades para mantener la coherencia
	// categoría <-> subcategoría en la interfaz.
	const subcategories = $derived(data.subcategories ?? []);

	function categoryKeyOf(catId) {
		return data.categories.find((c) => c.id === catId)?.categoryKey ?? null;
	}

	function subcatsForCategory(catId) {
		const key = categoryKeyOf(catId);
		if (!key) return [];
		return subcategories.filter((s) => s.categoryKey === key);
	}

	// Al cambiar la categoría, si la subcategoría ya no aplica se reinicia.
	function onItemCategoryChange(item) {
		const allowed = subcatsForCategory(item.categoryId).map((s) => s.key);
		if (item.subcategoryKey && !allowed.includes(item.subcategoryKey)) {
			item.subcategoryKey = '';
		}
	}

	// Al cambiar la subcategoría, se actualiza la categoría principal coherente.
	function onItemSubcategoryChange(item) {
		const sub = subcategories.find((s) => s.key === item.subcategoryKey);
		if (!sub) return;
		const cat = data.categories.find((c) => c.categoryKey === sub.categoryKey);
		if (cat) item.categoryId = cat.id;
	}

	function onSingleCategoryChange() {
		if (!subcatsForCategory(singleCategoryId).some((s) => s.key === singleSubcategoryKey)) {
			singleSubcategoryKey = '';
		}
	}

	function onSingleSubcategoryChange() {
		const sub = subcategories.find((s) => s.key === singleSubcategoryKey);
		if (!sub) return;
		const cat = data.categories.find((c) => c.categoryKey === sub.categoryKey);
		if (cat) singleCategoryId = cat.id;
	}

	// Actualizar estado si llega un draft del form
	$effect(() => {
		if (form?.draft) {
			merchant = form.draft.merchant || '';
			date = form.draft.date || '';
			totalPesos = String(centsToPesos(form.draft.totalCents));
			items = form.draft.items.map((it) => ({
				...it,
				amountPesos: String(centsToPesos(it.amountCents))
			}));
			state = 'revision';
			isUploading = false;
		}
	});

	// Cálculo de suma de artículos en tiempo real
	const sumItemsPesos = $derived.by(() => {
		let sum = 0;
		for (const it of items) {
			const val = parseFloat(it.amountPesos);
			if (!isNaN(val)) sum += val;
		}
		return Math.round(sum * 100) / 100;
	});

	const totalParsed = $derived.by(() => {
		const val = parseFloat(totalPesos);
		return isNaN(val) ? 0 : Math.round(val * 100) / 100;
	});

	const sumMismatch = $derived(
		!onlyTotal && items.length > 0 && Math.abs(sumItemsPesos - totalParsed) > 0.5
	);

	function resetToCapture() {
		state = 'capturar';
		form = null;
	}

	let fileInputRef;
	let cameraInputRef;

	function triggerCamera() {
		cameraInputRef?.click();
	}

	function triggerUpload() {
		fileInputRef?.click();
	}

	function handleFileChange(e) {
		const file = e.target.files?.[0];
		if (!file || file.size === 0) return;
		isUploading = true;
		e.target.form?.requestSubmit();
	}

	/**
	 * Aprendizaje por corrección (única vía: el form action ?/guardar del backend).
	 * Esta función quedó como no-op intencional: antes hacía un POST redundante a
	 * /api/item-corrections que duplicaba escrituras. El backend guarda la corrección
	 * SOLO si el usuario aclaró un ambiguo o editó descripción/categoría.
	 */
	async function persistUserCorrections() {
		return;
	}
</script>

<svelte:head>
	<title>Escanear ticket — Fincheck</title>
</svelte:head>

<div class="scan-page">
	<div class="top-bar">
		<a href="/" class="back-link" aria-label="Volver a inicio">
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
		<h1 class="page-title">Escanear ticket</h1>
		<div style="width: 2.5rem;"></div>
	</div>

	<!-- ESTADO 1: CAPTURAR -->
	{#if state === 'capturar' && !isUploading}
		<div class="capture-container">
			{#if form?.error}
				<div class="error-card card">
					<p class="error-text">{form.error}</p>
					{#if form.canManual}
						<a href="/registrar" class="mt-2 btn-primary w-full">Registrar manualmente</a>
					{/if}
				</div>
			{/if}

			<div class="hero-box card">
				<div class="hero-icon">
					<svg
						width="44"
						height="44"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<line x1="7" y1="8" x2="17" y2="8" />
						<line x1="7" y1="12" x2="17" y2="12" />
						<line x1="7" y1="16" x2="13" y2="16" />
					</svg>
				</div>
				<h2 class="hero-title">Captura tu recibo de compra</h2>
				<p class="hero-desc">
					La IA leerá el comercio, la fecha, el total y clasificará cada artículo automáticamente en
					tus hábitos.
				</p>

				<!-- Formulario oculto de carga con input con capture -->
				<form
					method="post"
					action="?/procesar"
					enctype="multipart/form-data"
					use:enhance={() => {
						isUploading = true;
						return async ({ update }) => {
							isUploading = false;
							await update();
						};
					}}
					class="upload-form"
				>
					<!-- Input directo para cámara en móviles -->
					<input
						bind:this={cameraInputRef}
						type="file"
						name="image"
						accept="image/*"
						capture="environment"
						class="hidden-input"
						onchange={handleFileChange}
					/>

					<!-- Input general para galería o archivo -->
					<input
						bind:this={fileInputRef}
						type="file"
						name="image_galeria"
						accept="image/jpeg,image/png,image/webp,image/heic"
						class="hidden-input"
						onchange={handleFileChange}
					/>

					<div class="action-buttons">
						<button type="button" class="action-large btn-primary" onclick={triggerCamera}>
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
								/>
								<circle cx="12" cy="13" r="4" />
							</svg>
							<span>Tomar foto con la cámara</span>
						</button>

						<button type="button" class="action-large btn-secondary" onclick={triggerUpload}>
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect x="3" y="3" width="18" height="18" rx="2" />
								<circle cx="8.5" cy="8.5" r="1.5" />
								<polyline points="21 15 16 10 5 21" />
							</svg>
							<span>Subir desde la galería</span>
						</button>
					</div>
				</form>
			</div>

			<div class="tips-card card">
				<h3 class="tips-title">Consejos para una lectura perfecta</h3>
				<ul class="tips-list">
					<li>Procura buena iluminación y evita sombras fuertes.</li>
					<li>Alinea el ticket plano y enfoca el texto antes de disparar.</li>
					<li>La imagen solo se procesa para extraer datos: no guardamos tu foto.</li>
				</ul>
			</div>

			<div class="manual-fallback-link">
				<a href="/registrar">¿Prefieres registrar sin foto? Toca aquí</a>
			</div>
		</div>
	{/if}

	<!-- ESTADO 2: PROCESANDO -->
	{#if isUploading}
		<div class="processing-container card">
			<div class="spinner-circle"></div>
			<h2 class="proc-title">Leyendo tu ticket con IA...</h2>
			<p class="proc-desc">
				Estamos extrayendo el comercio, el total y clasificando cada artículo según tus hábitos.
			</p>
			<div class="pulse-bar"></div>
		</div>
	{/if}

	<!-- ESTADO 3: REVISIÓN -->
	{#if state === 'revision' && !isUploading}
		<div class="revision-container">
			<div class="revision-header">
				<h2 class="section-title">Revisa los datos del ticket</h2>
				<button type="button" class="btn-text" onclick={resetToCapture}> Volver a escanear </button>
			</div>

			<form
				method="post"
				action="?/guardar"
				use:enhance={() => {
					isSaving = true;
					// Enviar correcciones manuales al endpoint de aprendizaje en paralelo
					// (no bloquea el guardado; ?/guardar también hace upsert de respaldo).
					const correctionsPromise = persistUserCorrections();
					return async ({ update }) => {
						try {
							await correctionsPromise;
						} catch (err) {
							console.error('[escanear] corrections error:', err);
						}
						isSaving = false;
						await update();
					};
				}}
				class="review-form"
			>
				<!-- Encabezado editable del ticket -->
				<div class="header-card card">
					<div class="field">
						<label for="rev-merchant" class="field-label">Comercio</label>
						<input
							type="text"
							id="rev-merchant"
							name="merchant"
							bind:value={merchant}
							placeholder="Ej. Oxxo, Walmart, Starbucks"
							class="input-field"
							required
						/>
					</div>

					<div class="fields-row">
						<div class="field flex-1">
							<label for="rev-date" class="field-label">Fecha</label>
							<input
								type="date"
								id="rev-date"
								name="date"
								bind:value={date}
								class="input-field"
								required
							/>
						</div>

						<div class="field flex-1">
							<label for="rev-total" class="field-label">Total ($)</label>
							<input
								type="text"
								inputmode="decimal"
								id="rev-total"
								name="total"
								bind:value={totalPesos}
								class="input-field font-bold"
								required
							/>
						</div>
					</div>

					<!-- Switch: Solo guardar el total -->
					<div class="only-total-row">
						<label class="switch-label" for="onlyTotalSwitch">
							<div>
								<span class="switch-title">Solo guardar el total</span>
								<span class="switch-desc"
									>Guarda como un solo movimiento sin detalle de artículos</span
								>
							</div>
							<input
								type="checkbox"
								id="onlyTotalSwitch"
								name="onlyTotal"
								value="true"
								bind:checked={onlyTotal}
								class="toggle-checkbox"
							/>
						</label>
					</div>

					{#if onlyTotal}
						<div class="field mt-3">
							<label for="singleCatSelect" class="field-label">Categoría para este ticket</label>
							<select
								id="singleCatSelect"
								name="singleCategoryId"
								bind:value={singleCategoryId}
								onchange={onSingleCategoryChange}
								class="input-field"
							>
								{#each data.categories as cat}
									<option value={cat.id}>{cat.name}</option>
								{/each}
							</select>
						</div>

						<div class="field mt-3">
							<label for="singleSubcatSelect" class="field-label">Subcategoría</label>
							<select
								id="singleSubcatSelect"
								name="singleSubcategoryKey"
								bind:value={singleSubcategoryKey}
								onchange={onSingleSubcategoryChange}
								class="input-field"
							>
								<option value="">Pendiente de revisión</option>
								{#each subcatsForCategory(singleCategoryId) as sub (sub.key)}
									<option value={sub.key}>{sub.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>

				<!-- Aviso de discrepancia entre total y suma de artículos -->
				{#if sumMismatch}
					<div class="discrepancy-card card">
						<div class="disc-icon">⚠️</div>
						<div class="disc-text">
							<span>Aviso discreto:</span> La suma de los artículos (${sumItemsPesos.toFixed(2)}) no
							coincide exactamente con el total (${totalParsed.toFixed(2)}). Puedes guardar de todos
							modos.
						</div>
					</div>
				{/if}

				<!-- Lista de artículos con selector de categoría -->
				{#if !onlyTotal}
					<div class="items-card card">
						<div class="items-top-bar">
							<span class="items-count-label">Artículos identificados ({items.length})</span>
							<span class="items-instruction">Toca una categoría para corregirla</span>
						</div>

						<input type="hidden" name="itemsCount" value={items.length} />

						{#if items.length === 0}
							<p class="empty-items-text">
								No se desglosaron artículos individuales. Puedes guardar el total directamente
								activando "Solo guardar el total".
							</p>
						{:else}
							<div class="items-list">
								{#each items as item, index}
									{#if index > 0}
										<div class="divider"></div>
									{/if}
									<div class="item-block">
										<div class="item-main-row">
											<input
												type="text"
												name="item_desc_{index}"
												bind:value={item.originalDescription}
												class="item-desc-input"
												placeholder={item.rawDescription || 'Descripción del artículo'}
												title={item.rawDescription &&
												item.rawDescription !== item.originalDescription
													? `Texto del ticket: ${item.rawDescription}`
													: 'Descripción del artículo (editable)'}
												required
											/>
											<div class="item-price-wrapper">
												<span class="dollar">$</span>
												<input
													type="text"
													inputmode="decimal"
													name="item_amount_{index}"
													bind:value={item.amountPesos}
													class="item-price-input"
													required
												/>
											</div>
										</div>

										<div class="item-meta-row">
											{#if item.department}<span
													class="meta-chip meta-dept"
													title="Departamento detectado en el ticket">{item.department}</span
												>{/if}
											{#if item.itemCode}<span
													class="meta-chip meta-code"
													title="Código EAN/UPC del ticket">{item.itemCode}</span
												>{/if}
											{#if item.rawDescription && item.rawDescription !== item.originalDescription}<span
													class="meta-raw"
													title="Texto exacto del ticket">Ticket: {item.rawDescription}</span
												>{/if}
										</div>

										<div class="item-classification">
											<div class="classify-field">
												<label class="classify-label" for="item_cat_{index}">Categoría</label>
												<div class="cat-picker-container">
													<select
														id="item_cat_{index}"
														name="item_cat_{index}"
														bind:value={item.categoryId}
														onchange={() => onItemCategoryChange(item)}
														class="item-cat-select"
														class:pending-select={!item.categoryId}
													>
														<option value="">Sin clasificar (Pendiente)</option>
														{#each data.categories as cat}
															<option value={cat.id}>{cat.name}</option>
														{/each}
													</select>
												</div>
											</div>

											<div class="classify-field">
												<label class="classify-label" for="item_subcat_{index}">Subcategoría</label>
												<div class="cat-picker-container">
													<select
														id="item_subcat_{index}"
														name="item_subcat_{index}"
														bind:value={item.subcategoryKey}
														onchange={() => onItemSubcategoryChange(item)}
														class="item-cat-select"
														class:pending-select={!item.subcategoryKey}
													>
														<option value="">Pendiente de revisión</option>
														{#each subcatsForCategory(item.categoryId) as sub (sub.key)}
															<option value={sub.key}>{sub.name}</option>
														{/each}
													</select>
												</div>
											</div>

											{#if !item.subcategoryKey || item.status === 'ambiguous'}
												<span class="badge-pending">Resolver</span>
											{/if}
										</div>

										<input type="hidden" name="item_status_{index}" value={item.status} />
										<input
											type="hidden"
											name="item_raw_{index}"
											value={item.rawDescription || ''}
										/>
										<!-- Descripción original propuesta por la IA: sirve para detectar
										     si el usuario la editó (no confundir con el texto crudo del ticket). -->
										<input
											type="hidden"
											name="item_desc_orig_{index}"
											value={item.cleanDescription || item.originalDescription || ''}
										/>
										<input type="hidden" name="item_code_{index}" value={item.itemCode || ''} />
										<input type="hidden" name="item_dept_{index}" value={item.department || ''} />
										<input
											type="hidden"
											name="item_cat_orig_{index}"
											value={item.aiCategoryId || ''}
										/>
										<input
											type="hidden"
											name="item_subcat_orig_{index}"
											value={item.aiSubcategoryKey || ''}
										/>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<div class="submit-section">
					<button type="submit" class="save-btn btn-primary w-full" disabled={isSaving}>
						{isSaving ? 'Guardando...' : 'Guardar ticket'}
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>

<style>
	.scan-page {
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

	.capture-container {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.error-card {
		padding: 1rem 1.25rem;
		background: var(--color-danger-50);
		border-color: var(--color-danger-200);
	}

	.error-text {
		color: var(--color-danger-600);
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.4;
	}

	.hero-box {
		padding: 2.5rem 1.5rem;
		text-align: center;
	}

	.hero-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 5rem;
		height: 5rem;
		border-radius: var(--radius-2xl);
		background: var(--color-primary-50);
		color: var(--color-primary-600);
		margin-bottom: 1.25rem;
	}

	.hero-title {
		font-size: 1.375rem;
		font-weight: 800;
		margin-bottom: 0.5rem;
	}

	.hero-desc {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
		margin-bottom: 2rem;
		max-width: 22rem;
		margin-inline: auto;
	}

	.hidden-input {
		display: none;
	}

	.action-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.action-large {
		height: 3.5rem;
		font-size: 1rem;
		gap: 0.75rem;
		width: 100%;
		border-radius: var(--radius-xl);
	}

	.tips-card {
		padding: 1.25rem 1.5rem;
	}

	.tips-title {
		font-size: 0.875rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.tips-list {
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
	}

	.manual-fallback-link {
		text-align: center;
		margin-top: 0.5rem;
		margin-bottom: 1rem;

		a {
			font-size: 0.875rem;
			color: var(--color-primary-600);
			font-weight: 600;
			text-decoration: none;
		}
	}

	.processing-container {
		padding: 4rem 1.5rem;
		text-align: center;
		margin-top: 2rem;
	}

	.spinner-circle {
		width: 3.5rem;
		height: 3.5rem;
		border: 4px solid var(--input-bg);
		border-top-color: var(--color-primary-500);
		border-radius: 50%;
		margin: 0 auto 1.5rem;
		animation: spin 1s linear infinite;
	}

	.proc-title {
		font-size: 1.25rem;
		font-weight: 800;
		margin-bottom: 0.5rem;
	}

	.proc-desc {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
		max-width: 20rem;
		margin: 0 auto 1.5rem;
	}

	.pulse-bar {
		width: 10rem;
		height: 0.25rem;
		background: var(--color-primary-100);
		border-radius: var(--radius-full);
		margin: 0 auto;
		overflow: hidden;
		position: relative;

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			background: var(--color-primary-500);
			animation: pulseWidth 1.5s ease-in-out infinite alternate;
		}
	}

	.revision-container {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.revision-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.btn-text {
		background: none;
		border: none;
		color: var(--color-primary-600);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
	}

	.review-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.header-card,
	.items-card {
		padding: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.75rem;
	}

	.fields-row {
		display: flex;
		gap: 0.75rem;
	}

	.flex-1 {
		flex: 1;
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text);
	}

	.font-bold {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.only-total-row {
		padding-top: 0.75rem;
		margin-top: 0.5rem;
		border-top: 1px solid var(--app-border);
	}

	.switch-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		gap: 1rem;
	}

	.switch-title {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.switch-desc {
		display: block;
		font-size: 0.75rem;
		color: var(--app-text-secondary);
	}

	.toggle-checkbox {
		width: 1.5rem;
		height: 1.5rem;
		accent-color: var(--color-primary-500);
		cursor: pointer;
	}

	.discrepancy-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: var(--color-accent-50);
		border-color: var(--color-accent-200);
	}

	.disc-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.disc-text {
		font-size: 0.8125rem;
		color: var(--color-accent-900);
		line-height: 1.4;

		span {
			font-weight: 700;
		}
	}

	.items-top-bar {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.items-count-label {
		font-size: 0.875rem;
		font-weight: 700;
	}

	.items-instruction {
		font-size: 0.6875rem;
		color: var(--app-text-secondary);
	}

	.items-list {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.item-block {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.item-main-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.item-desc-input {
		flex: 1;
		background: transparent;
		border: 1px solid transparent;
		padding: 0.25rem 0.375rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--app-text);

		&:focus {
			border-color: var(--app-border);
			background: var(--input-bg);
		}
	}

	.item-price-wrapper {
		display: flex;
		align-items: center;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-md);
		padding: 0.25rem 0.5rem;
		width: 5.5rem;
		flex-shrink: 0;
	}

	.dollar {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		margin-right: 0.25rem;
	}

	.item-price-input {
		width: 100%;
		border: none;
		background: transparent;
		font-size: 0.875rem;
		font-weight: 700;
		text-align: right;
		outline: none;
		font-variant-numeric: tabular-nums;
	}

	.item-meta-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.meta-chip {
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.125rem 0.4375rem;
		border-radius: var(--radius-sm);
	}

	.meta-dept {
		background: var(--color-accent-50);
		color: var(--color-accent-800);
		border: 1px solid var(--color-accent-300);
	}

	.meta-code {
		background: var(--input-bg);
		color: var(--app-text-secondary);
		border: 1px dashed var(--app-border);
	}

	.meta-raw {
		font-size: 0.6875rem;
		color: var(--app-text-secondary);
	}

	.item-classification {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.classify-field {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
		min-width: 8rem;
	}

	.classify-label {
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--app-text-secondary);
	}

	.cat-picker-container {
		flex: 1;
	}

	.item-cat-select {
		width: 100%;
		padding: 0.3125rem 0.5rem;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		color: var(--app-text);
		cursor: pointer;

		&.pending-select {
			background: var(--color-accent-50);
			border-color: var(--color-accent-300);
			color: var(--color-accent-800);
			font-weight: 600;
		}
	}

	.badge-pending {
		font-size: 0.6875rem;
		font-weight: 700;
		background: var(--color-accent-500);
		color: white;
		padding: 0.1875rem 0.4375rem;
		border-radius: var(--radius-sm);
	}

	.empty-items-text {
		font-size: 0.875rem;
		color: var(--app-text-secondary);
		padding: 1rem 0;
		text-align: center;
	}

	.divider {
		height: 1px;
		background: var(--app-border);
	}

	.save-btn {
		height: 3.5rem;
		font-size: 1rem;
		border-radius: var(--radius-xl);
	}

	.w-full {
		width: 100%;
	}

	.mt-2 {
		margin-top: 0.5rem;
	}

	.mt-3 {
		margin-top: 0.75rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes pulseWidth {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(100%);
		}
	}
</style>
