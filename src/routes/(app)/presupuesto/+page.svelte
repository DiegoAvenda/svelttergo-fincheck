<script>
	import { enhance } from '$app/forms';
	import { formatMoney, parseAmountToCents } from '$lib/utils/money.js';
	import { remainingFromIncome, lineProgressPct } from '$lib/utils/budget-math.js';

	let { data, form } = $props();

	/** @param {any} line */
	function mapLine(line) {
		return {
			key: line.key,
			categoryId: line.categoryId,
			name: line.name,
			categoryKey: line.categoryKey,
			isCustom: !!line.isCustom,
			isHidden: !!line.isHidden,
			isMissing: !!line.isMissing,
			hasReferences: !!line.hasReferences,
			hasSpending: !!line.hasSpending,
			isStored: !!line.isStored,
			generalStored: !!line.generalStored,
			generalCanEdit: !!line.generalCanEdit,
			general: line.plannedPesos,
			spentCents: line.spentCents,
			generalSpentCents: line.generalSpentCents,
			totalPlannedCents: line.totalPlannedCents,
			expanded: !!line.isHidden,
			newSubName: '',
			subcategories: (line.subcategories ?? []).map((sub) => ({
				id: sub.id ?? null,
				key: sub.key,
				name: sub.name,
				isCustom: !!sub.isCustom,
				isHidden: !!sub.isHidden,
				isMissing: !!sub.isMissing,
				hasReferences: !!sub.hasReferences,
				canEdit: !!sub.canEdit,
				isStored: !!sub.isStored,
				amount: sub.plannedPesos,
				plannedCents: sub.plannedCents,
				spentCents: sub.spentCents
			}))
		};
	}

	/** @param {any[]} list */
	function sortLines(list) {
		// Orden estable: visibles primero, ocultas al final.
		return [...list].sort((a, b) => {
			if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
			return 0;
		});
	}

	let income = $state(data.incomePesos);
	let lines = $state(sortLines(data.lines.map(mapLine)));
	let pickerOpen = $state(false);
	let newName = $state('');
	let saving = $state(false);
	let proposing = $state(false);
	let discarding = $state(false);
	let lastMonthKey = data.monthKey;

	$effect(() => {
		if (data.monthKey !== lastMonthKey) {
			lastMonthKey = data.monthKey;
			lines = sortLines(data.lines.map(mapLine));
			income = data.incomePesos;
			pickerOpen = false;
			newName = '';
			saving = false;
			proposing = false;
			discarding = false;
		}
	});

	let available = $derived(
		data.categories.filter((cat) => !lines.some((line) => line.categoryId === cat.id))
	);
	let customCategories = $derived(data.categories.filter((cat) => cat.isCustom));
	let firstHiddenIndex = $derived(lines.findIndex((line) => line.isHidden));

	function toCents(value) {
		return parseAmountToCents(String(value ?? '')) ?? 0;
	}

	/** @param {any} line */
	function catPlanned(line) {
		return (
			toCents(line.general) +
			line.subcategories.reduce((total, sub) => total + toCents(sub.amount), 0)
		);
	}

	let plannedCents = $derived(lines.reduce((total, line) => total + catPlanned(line), 0));
	let summaryPlanned = $derived(data.isCurrentMonth ? plannedCents : data.plannedCents);
	let summaryDifference = $derived(
		data.isCurrentMonth ? plannedCents - data.spentCents : data.differenceCents
	);
	let incomeCents = $derived(
		income === '' || income === null || income === undefined
			? null
			: parseAmountToCents(String(income))
	);
	let expectedIncomeCents = $derived(data.isCurrentMonth ? incomeCents : data.incomeCents);
	let realBalanceCents = $derived(data.realIncomeCents - data.spentCents);
	// "Sin asignar" = ingreso esperado menos lo planeado (presupuesto base cero).
	let unassignedCents = $derived(
		data.isCurrentMonth
			? remainingFromIncome(incomeCents, plannedCents)
			: remainingFromIncome(data.incomeCents, data.plannedCents)
	);
	// Avance de ejecución: gasto real sobre gasto planeado (no sobre el ingreso).
	let spentPct = $derived(lineProgressPct(data.spentCents, summaryPlanned));

	/** @param {any} line */
	function toggle(line) {
		line.expanded = !line.expanded;
	}

	/** @param {string} key */
	function removeCategory(key) {
		lines = lines.filter((line) => line.key !== key);
	}

	/** @param {any} cat */
	function addCategory(cat) {
		if (lines.some((line) => line.categoryId === cat.id)) return;
		lines = sortLines([
			...lines,
			{
				key: cat.id,
				categoryId: cat.id,
				name: cat.name,
				categoryKey: cat.categoryKey,
				isCustom: !!cat.isCustom,
				isHidden: false,
				isMissing: false,
				hasReferences: !!cat.hasReferences,
				hasSpending: false,
				isStored: false,
				generalStored: false,
				generalCanEdit: true,
				general: '',
				spentCents: cat.spentCents ?? 0,
				generalSpentCents: cat.generalSpentCents ?? 0,
				totalPlannedCents: 0,
				expanded: true,
				newSubName: '',
				subcategories: (cat.subcategories ?? []).map((sub) => ({
					id: sub.id ?? null,
					key: sub.key,
					name: sub.name,
					isCustom: !!sub.isCustom,
					isHidden: false,
					isMissing: false,
					hasReferences: !!sub.hasReferences,
					canEdit: true,
					isStored: false,
					amount: '',
					plannedCents: 0,
					spentCents: sub.spentCents ?? 0
				}))
			}
		]);
		pickerOpen = false;
	}

	async function createCategoryEnhance({ result, update }) {
		await update();
		if (result.type === 'success') {
			const newId = result.data?.createdCategoryId;
			const cat = newId ? data.categories.find((candidate) => candidate.id === newId) : null;
			if (cat) addCategory(cat);
			newName = '';
		}
	}

	async function deleteCustomEnhance({ result, update }) {
		await update();
		if (result.type === 'success') {
			const id = result.data?.deletedId;
			if (id) {
				lines = sortLines(
					lines
						.filter((line) => line.categoryId !== id)
						.map((line) => ({
							...line,
							subcategories: line.subcategories.filter((sub) => sub.id !== id)
						}))
				);
			}
		}
	}

	// Ocultar NO elimina la línea del presupuesto: la conserva y la mueve a la
	// sección de categorías ocultas. Tampoco borra movimientos ni importes.
	async function hideCustomEnhance({ result, update }) {
		await update();
		if (result.type !== 'success') return;
		const id = result.data?.hiddenId;
		if (!id) return;

		lines = sortLines(
			lines.map((line) => {
				if (line.categoryId === id) {
					return {
						...line,
						isHidden: true,
						hasReferences: true,
						generalCanEdit: line.generalStored,
						subcategories: line.subcategories
							.filter((sub) => sub.isStored || sub.spentCents > 0)
							.map((sub) => ({ ...sub, canEdit: sub.isStored }))
					};
				}
				return {
					...line,
					subcategories: line.subcategories.map((sub) =>
						sub.id === id
							? { ...sub, isHidden: true, hasReferences: true, canEdit: sub.isStored }
							: sub
					)
				};
			})
		);
	}

	async function createSubEnhance({ result, update }) {
		await update();
		if (result.type === 'success') {
			const sub = result.data?.createdSubcategory;
			if (sub) {
				const line = lines.find((candidate) => candidate.categoryId === sub.categoryId);
				if (line) {
					if (!line.subcategories.some((candidate) => candidate.key === sub.key)) {
						line.subcategories = [
							...line.subcategories,
							{
								id: sub.id,
								key: sub.key,
								name: sub.name,
								isCustom: true,
								isHidden: false,
								isMissing: false,
								hasReferences: false,
								canEdit: true,
								isStored: false,
								amount: '',
								plannedCents: 0,
								spentCents: 0
							}
						];
					}
					line.newSubName = '';
				}
			}
		}
	}

	async function proposeEnhance({ result, update }) {
		await update();
		proposing = false;
		if (result.type === 'success') {
			lines = sortLines(data.lines.map(mapLine));
			income = data.incomePesos;
			pickerOpen = false;
		}
	}

	async function discardDraftEnhance({ result, update }) {
		await update();
		discarding = false;
		if (result.type === 'success') {
			lines = sortLines(data.lines.map(mapLine));
			income = data.incomePesos;
			pickerOpen = false;
		}
	}

	/** @param {string} name */
	function confirmDelete(name) {
		return window.confirm(
			`¿Eliminar "${name}"? Solo es posible si nunca tuvo movimientos ni presupuesto guardado. Si tiene referencias, usa Ocultar.`
		);
	}

	// Para categorías/subcategorías con referencias se ofrece Ocultar; sin
	// referencias se permite el borrado definitivo.
	/** @param {any} item */
	function canDelete(item) {
		return !item.hasReferences;
	}

	/** @param {string} monthKey */
	function goToMonth(monthKey) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('month', monthKey);
		// En modo prueba se conserva el mes simulado al navegar por el historial.
		if (data.preview?.mode && data.preview.monthKey) {
			url.searchParams.set('previewMonth', data.preview.monthKey);
		}
		window.location.assign(url.toString());
	}
</script>

<svelte:head>
	<title>Presupuesto — contlana</title>
</svelte:head>

<div class="budget-page">
	<header class="header">
		<h1 class="page-title">Presupuesto</h1>
		<p class="subtitle">Planea tu gasto por ciclo y compáralo con lo real. Ciclos anteriores: solo lectura.</p>
	</header>

	{#if data.preview?.mode}
		<div class="preview-banner card">
			<p class="preview-banner-title">Modo prueba (solo dev) · viendo {data.monthLabel}</p>
			<p class="preview-banner-desc">
				Solo lectura: no se guardan ni copian presupuestos. El mes real no se modifica.
			</p>
			<div class="preview-banner-actions">
				<form method="get" action="/presupuesto">
					<input type="hidden" name="previewMonth" value={data.preview.nextMonthKey} />
					<button type="submit" class="btn-secondary">Avanzar otro mes</button>
				</form>
				<form method="get" action="/presupuesto">
					<button type="submit" class="btn-secondary">Volver al mes real</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Navegación mensual -->
	<div class="month-nav card">
		{#if data.canGoPrev}
			<button
				type="button"
				class="month-arrow"
				onclick={() => goToMonth(data.prevMonthKey)}
				aria-label="Mes anterior">‹</button
			>
		{:else}
			<span class="month-arrow disabled" aria-hidden="true">‹</span>
		{/if}

		<div class="month-center">
			<select
				class="month-select"
				aria-label="Mes del presupuesto"
				onchange={(event) => goToMonth(event.currentTarget.value)}
			>
				{#each data.monthOptions as option (option.key)}
					<option value={option.key} selected={option.key === data.monthKey}>
						{option.label}
					</option>
				{/each}
			</select>
			<span class="period-range">{data.periodRangeLabel}</span>
			<div class="month-badges">
				{#if !data.isCurrentMonth}
					<span class="readonly-badge">Solo lectura</span>
				{/if}
				{#if data.isTransitionPeriod}
					<span class="status-badge transition">Transición</span>
				{/if}
				{#if data.isDraft}
					<span class="status-badge draft">Propuesta pendiente</span>
				{:else if data.hasStoredBudget}
					<span class="status-badge confirmed">Confirmado</span>
				{:else}
					<span class="status-badge empty">Sin presupuesto</span>
				{/if}
			</div>
		</div>

		{#if data.canGoNext}
			<button
				type="button"
				class="month-arrow"
				onclick={() => goToMonth(data.nextMonthKey)}
				aria-label="Mes siguiente">›</button
			>
		{:else}
			<span class="month-arrow disabled" aria-hidden="true">›</span>
		{/if}
	</div>

	{#if form?.error}
		<div class="error-banner card">
			<p>{form.error}</p>
		</div>
	{/if}

	{#if form?.savedBudget}
		<div class="success-banner card">Presupuesto confirmado correctamente</div>
	{/if}

	{#if form?.proposed}
		<div class="success-banner card">Propuesta creada con {form.proposedCount} líneas{#if form.proposedFromLabel}. Desde {form.proposedFromLabel}{/if}. Confírmala para guardar.</div>
	{/if}

	{#if form?.discardedDraft}
		<div class="success-banner card">Propuesta descartada.</div>
	{/if}

	{#if data.isDraft && data.isCurrentMonth}
		<div class="draft-banner card">
			<div class="draft-banner-copy">
				<p class="draft-banner-title">Propuesta pendiente de confirmar</p>
				<p class="draft-banner-desc">Revisa importes y confirma para que cuente. También puedes descartarla.</p>
			</div>
			{#if !data.replacedConfirmed}
				<form
					method="post"
					action="?/discardDraft"
					use:enhance={({ cancel }) => {
						if (!window.confirm('¿Descartar esta propuesta pendiente?')) {
							cancel();
							return;
						}
						discarding = true;
						return discardDraftEnhance;
					}}
				>
					<input type="hidden" name="month" value={data.monthKey} />
					<button type="submit" class="discard-btn btn-danger" disabled={discarding}>
						{discarding ? 'Descartando…' : 'Descartar propuesta'}
					</button>
				</form>
			{:else}
				<p class="summary-hint">
					Esta propuesta reemplazó un presupuesto confirmado; confírmala para no perder sus
					importes.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Resumen: plan del ciclo (ingreso esperado vs. planeado) y ejecución real -->
	<div class="summary-card card">
		{#if data.isCurrentMonth}
			<div class="income-field">
				<label for="plannedIncome" class="field-label"
					>Ingreso que esperas recibir este ciclo ($ MXN)</label
				>
				<input
					type="text"
					inputmode="decimal"
					id="plannedIncome"
					name="plannedIncome"
					form="budgetForm"
					bind:value={income}
					placeholder="Ej. 18000"
					class="input-field"
				/>
				{#if data.incomeIsFallback}
					<span class="summary-hint">Referencia de Ajustes. Puedes cambiarlo.</span>
				{:else if data.incomeType === 'fixed'}
					<span class="summary-hint">Fijos: se precarga del ciclo anterior.</span>
				{:else if data.incomeType === 'variable'}
					<span class="summary-hint">Variables: sin precarga. Referencia: {formatMoney(data.previousRealIncomeCents)}.</span>
				{:else}
					<span class="summary-hint">Define tipo de ingreso en Ajustes.</span>
				{/if}
			</div>
		{/if}

		<!-- Plan del ciclo: cuánto esperas recibir y cómo lo repartiste -->
		<section class="summary-section">
			<div class="section-head">
				<h2 class="section-heading">Plan del ciclo</h2>
				{#if !data.isCurrentMonth && expectedIncomeCents !== null}
					<span class="section-caption">
						Ingreso esperado
						<strong>{formatMoney(expectedIncomeCents)}</strong>
					</span>
				{/if}
			</div>

			<div class="plan-grid">
				<div class="summary-item">
					<span class="summary-label">Planeado para gastar</span>
					<span class="summary-value">{formatMoney(summaryPlanned)}</span>
				</div>
				<div class="summary-item">
					<span class="summary-label">Sin asignar</span>
					{#if unassignedCents !== null}
						<span
							class="summary-value"
							class:pending={unassignedCents > 0}
							class:negative={unassignedCents < 0}
						>
							{formatMoney(unassignedCents)}
						</span>
					{:else}
						<span class="summary-value muted">Sin definir</span>
					{/if}
				</div>
			</div>

			{#if unassignedCents !== null}
				{#if unassignedCents > 0}
					<p class="summary-hint pending-hint">
						Puedes asignar este monto a una categoría o dejarlo como margen sin presupuestar.
					</p>
				{:else if unassignedCents === 0}
					<p class="summary-hint">Presupuesto base cero: todo tu ingreso esperado está asignado.</p>
				{:else}
					<p class="summary-hint negative-hint">
						Planeaste {formatMoney(Math.abs(unassignedCents))} más de lo que esperas recibir.
					</p>
				{/if}
			{:else if data.isCurrentMonth}
				<p class="summary-hint">
					Escribe el ingreso que esperas recibir para ver cuánto te queda sin asignar.
				</p>
			{:else}
				<p class="summary-hint">Este ciclo no tiene un ingreso esperado guardado.</p>
			{/if}
		</section>

		<!-- Ejecución real: gasto del ciclo contra el plan -->
		<section class="summary-section">
			<div class="section-head">
				<h2 class="section-heading">Ejecución del mes</h2>
				{#if summaryPlanned > 0}
					<span class="section-caption" class:over={summaryDifference < 0}>
						{spentPct}% del plan gastado
					</span>
				{/if}
			</div>

			<div class="execution-amounts">
				<div class="summary-item">
					<span class="summary-label">Gastado</span>
					<span class="summary-value">{formatMoney(data.spentCents)}</span>
				</div>
				<div class="summary-item exec-right">
					<span class="summary-label">Planeado</span>
					<span class="summary-value muted">{formatMoney(summaryPlanned)}</span>
				</div>
			</div>

			{#if summaryPlanned > 0}
				<div class="progress-track">
					<div
						class="progress-bar"
						class:over={summaryDifference < 0}
						style="width: {Math.min(spentPct, 100)}%;"
					></div>
				</div>

				<div class="execution-balance" class:over={summaryDifference < 0}>
					<span>{summaryDifference >= 0 ? 'Disponible por gastar' : 'Excedido del plan'}</span>
					<strong>{formatMoney(Math.abs(summaryDifference))}</strong>
				</div>
			{:else if data.spentCents > 0}
				<p class="summary-hint">
					No hay un presupuesto planeado en este ciclo, así que todo el gasto real aparece sin plan.
				</p>
			{:else}
				<p class="summary-hint">Todavía no hay gasto real ni presupuesto planeado en este ciclo.</p>
			{/if}

			<div class="cashflow-row">
				<div class="summary-item">
					<span class="summary-label">Ingreso recibido</span>
					<span class="cashflow-value">{formatMoney(data.realIncomeCents)}</span>
				</div>
				<div class="summary-item">
					<span class="summary-label">Balance actual</span>
					<span
						class="cashflow-value"
						class:positive={realBalanceCents >= 0}
						class:negative={realBalanceCents < 0}
					>
						{formatMoney(realBalanceCents)}
					</span>
				</div>
			</div>
		</section>

		{#if !data.isCurrentMonth}
			<p class="summary-hint footnote">
				Consulta histórica: se conservan las fechas, los importes y la clasificación aunque las
				categorías estén ocultas.
			</p>
		{/if}

		{#if data.unbudgetedCents > 0}
			<p class="summary-hint unbudgeted-hint">
				Incluye {formatMoney(data.unbudgetedCents)} de gasto real sin presupuesto asignado.
			</p>
		{/if}
	</div>

	{#if data.isCurrentMonth}
		{#if !data.hasStoredBudget}
			<div class="draft-hint card">
				Aún no has guardado un presupuesto para este ciclo. Asigna un límite de gasto a tus
				categorías y guarda, o crea una propuesta desde el ciclo anterior.
			</div>
		{/if}

		<!-- Propuesta pendiente desde el último presupuesto confirmado -->
		<form
			method="post"
			action="?/propose"
			class="copy-form"
			use:enhance={({ cancel }) => {
				if (data.hasBudgetLines || data.isDraft) {
					const ok = window.confirm(
						'Ya existe un presupuesto o propuesta para este ciclo. ¿Quieres reemplazarlo con una propuesta del ciclo anterior?'
					);
					if (!ok) {
						cancel();
						return;
					}
				}
				proposing = true;
				return proposeEnhance;
			}}
		>
			<input type="hidden" name="month" value={data.monthKey} />
			<input
				type="hidden"
				name="confirm"
				value={data.hasBudgetLines || data.isDraft ? 'true' : 'false'}
			/>
			<button
				type="submit"
				class="btn-secondary w-full"
				disabled={!data.prevMonthHasBudget || proposing}
			>
				{proposing ? 'Creando propuesta…' : `Crear propuesta desde ${data.prevMonthLabel}`}
			</button>
			<p class="copy-hint">
				Crea un borrador con las líneas visibles de ese ciclo. No confirma nada ni crea movimientos;
				las categorías ocultas no se copian.
			</p>
			{#if !data.prevMonthHasBudget}
				<p class="copy-hint">No hay un presupuesto confirmado anterior para copiar.</p>
			{/if}
		</form>

		<form
			id="budgetForm"
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
			<input type="hidden" name="month" value={data.monthKey} />

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
						presupuestar en este ciclo.
					</p>
				</div>
			{:else}
				<div class="cat-list">
					{#each lines as line, index (line.key)}
						{#if line.isHidden && index === firstHiddenIndex}
							<div class="hidden-divider">
								<h2 class="section-title">Categorías ocultas con presupuesto</h2>
								<p class="section-desc">Conservan su importe. No se ofrecen para nuevas asignaciones.</p>
							</div>
						{/if}

						<div
							class="cat-block card"
							class:hidden-line={line.isHidden}
							class:missing-line={line.isMissing}
						>
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
									{:else if line.generalCanEdit}
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
									{:else}
										<span class="cat-total">
											{line.plannedCents > 0 ? formatMoney(line.plannedCents) : '—'}
										</span>
									{/if}
									{#if !line.isMissing}
										<button
											type="button"
											class="remove-btn"
											onclick={() => removeCategory(line.key)}
											aria-label="Quitar {line.name} del presupuesto"
										>
											✕
										</button>
									{/if}
								</div>
							</div>

							<div class="cat-meta">
								<span class="cat-real">Real en el ciclo: {formatMoney(line.spentCents)}</span>
								<span class="meta-tags">
									{#if line.isCustom}<span class="custom-tag">Personalizada</span>{/if}
									{#if line.isHidden}<span class="hidden-tag">Oculta</span>{/if}
									{#if line.isMissing}<span class="hidden-tag">No disponible</span>{/if}
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
									{:else if catPlanned(line) === 0 && line.spentCents > 0}
										<span class="diff over">Sin presupuesto asignado</span>
									{/if}
								</span>
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
										{#if line.generalCanEdit}
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
										{:else}
											<span class="sub-amount">
												{line.plannedCents > 0 ? formatMoney(line.plannedCents) : '—'}
											</span>
										{/if}
									</div>

									{#each line.subcategories as sub (sub.key)}
										<div class="sub-row" class:sub-hidden={sub.isHidden}>
											<div class="sub-label">
												<span class="sub-name">
													{sub.name}
													{#if sub.isCustom}<span class="custom-tag">Personalizada</span>{/if}
													{#if sub.isHidden}<span class="hidden-tag">Oculta</span>{/if}
													{#if sub.isMissing}<span class="hidden-tag">No disponible</span>{/if}
												</span>
												<span class="sub-real">Real: {formatMoney(sub.spentCents)}</span>
											</div>

											{#if sub.canEdit}
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
													{#if sub.isCustom && !sub.isHidden}
														{#if canDelete(sub)}
															<button
																type="submit"
																form="deleteCustomForm"
																name="id"
																value={sub.id}
																class="icon-delete"
																title="Eliminar subcategoría"
																aria-label="Eliminar subcategoría {sub.name}"
																onclick={(event) => {
																	if (!confirmDelete(sub.name)) event.preventDefault();
																}}
															>
																✕
															</button>
														{:else}
															<button
																type="submit"
																form="hideCustomForm"
																name="id"
																value={sub.id}
																class="hide-link"
																title="Ocultar subcategoría: tiene movimientos o presupuesto guardado"
															>
																Ocultar
															</button>
														{/if}
													{/if}
												</div>
											{:else}
												<span class="sub-amount">
													{sub.plannedCents > 0 ? formatMoney(sub.plannedCents) : '—'}
												</span>
											{/if}
										</div>
									{/each}

									{#if !line.isHidden && !line.isMissing}
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
									{/if}
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
										{#if canDelete(cat)}
											<button
												type="submit"
												form="deleteCustomForm"
												name="id"
												value={cat.id}
												class="icon-delete"
												title="Eliminar categoría"
												aria-label="Eliminar categoría {cat.name}"
												onclick={(event) => {
													if (!confirmDelete(cat.name)) event.preventDefault();
												}}
											>
												✕
											</button>
										{:else}
											<button
												type="submit"
												form="hideCustomForm"
												name="id"
												value={cat.id}
												class="hide-link"
												title="Ocultar categoría: tiene movimientos o presupuesto guardado"
											>
												Ocultar
											</button>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<button type="submit" class="save-btn btn-primary w-full" disabled={saving}>
				{saving ? 'Guardando...' : data.isDraft ? 'Confirmar presupuesto' : 'Guardar presupuesto'}
			</button>
		</form>

		<!-- Formulario aparte para crear categorías (asociado por el atributo `form`) -->
		<form
			id="createCategoryForm"
			method="post"
			action="?/createCategory"
			use:enhance={() => createCategoryEnhance}
		>
			<input type="hidden" name="month" value={data.monthKey} />
		</form>

		<!-- Formulario aparte para borrar categorías/subcategorías personalizadas -->
		<form
			id="deleteCustomForm"
			method="post"
			action="?/deleteCustom"
			use:enhance={() => deleteCustomEnhance}
		></form>

		<!-- Formulario aparte para ocultar categorías/subcategorías con referencias -->
		<form
			id="hideCustomForm"
			method="post"
			action="?/hideCustom"
			use:enhance={() => hideCustomEnhance}
		></form>

		<!-- Un formulario por categoría para crear subcategorías personalizadas -->
		{#each lines as line (line.key)}
			{#if !line.isHidden && !line.isMissing}
				<form
					id="createSubForm-{line.categoryId}"
					method="post"
					action="?/createSubcategory"
					use:enhance={() => createSubEnhance}
				>
					<input type="hidden" name="categoryId" value={line.categoryId} />
				</form>
			{/if}
		{/each}
	{:else}
		<!-- Historial: solo lectura -->
		{#if !data.hasStoredBudget}
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
				<h3 class="empty-heading">Sin presupuesto guardado</h3>
				<p class="empty-desc">No hay presupuesto para este ciclo. Abajo: gasto real sin plan.</p>
			</div>
		{:else if lines.length === 0}
			<div class="empty-state card">
				<h3 class="empty-heading">El presupuesto de este ciclo no tiene líneas</h3>
				<p class="empty-desc">
					No se guardaron categorías para este periodo. El gasto real se muestra abajo.
				</p>
			</div>
		{:else}
			<div class="cat-list">
				{#each lines as line, index (line.key)}
					{#if line.isHidden && index === firstHiddenIndex}
						<div class="hidden-divider">
							<h2 class="section-title">Categorías ocultas en este presupuesto</h2>
							<p class="section-desc">Conservan su importe. No se ofrecen para nuevos movimientos.</p>
						</div>
					{/if}

					<div
						class="cat-block read-only card"
						class:hidden-line={line.isHidden}
						class:missing-line={line.isMissing}
					>
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
								<span class="cat-total">
									{line.totalPlannedCents > 0 ? formatMoney(line.totalPlannedCents) : '—'}
								</span>
							</div>
						</div>

						<div class="cat-meta">
							<span class="cat-real">Real en el ciclo: {formatMoney(line.spentCents)}</span>
							<span class="meta-tags">
								{#if line.isCustom}<span class="custom-tag">Personalizada</span>{/if}
								{#if line.isHidden}<span class="hidden-tag">Oculta</span>{/if}
								{#if line.isMissing}<span class="hidden-tag">No disponible</span>{/if}
								{#if line.totalPlannedCents > 0 && line.spentCents > 0}
									{#if line.totalPlannedCents - line.spentCents >= 0}
										<span class="diff ok">
											Disponible: {formatMoney(line.totalPlannedCents - line.spentCents)}
										</span>
									{:else}
										<span class="diff over">
											Excedido: {formatMoney(line.spentCents - line.totalPlannedCents)}
										</span>
									{/if}
								{:else if line.totalPlannedCents === 0 && line.spentCents > 0}
									<span class="diff over">Sin presupuesto asignado</span>
								{/if}
							</span>
						</div>

						{#if line.subcategories.length > 0}
							{#if line.totalPlannedCents > 0}
								<div class="cat-track">
									<div
										class="cat-bar"
										class:over={lineProgressPct(line.spentCents, line.totalPlannedCents) > 100}
										style="width: {Math.min(
											lineProgressPct(line.spentCents, line.totalPlannedCents),
											100
										)}%;"
									></div>
								</div>
							{/if}

							<div class="subs static" class:collapsed={!line.expanded}>
								<div class="sub-row general">
									<div class="sub-label">
										<span class="sub-name">General (sin subcategoría)</span>
										<span class="sub-real">Real: {formatMoney(line.generalSpentCents)}</span>
									</div>
									<span class="sub-amount">
										{line.plannedCents > 0 ? formatMoney(line.plannedCents) : '—'}
									</span>
								</div>

								{#each line.subcategories as sub (sub.key)}
									<div class="sub-row" class:sub-hidden={sub.isHidden}>
										<div class="sub-label">
											<span class="sub-name">
												{sub.name}
												{#if sub.isCustom}<span class="custom-tag">Personalizada</span>{/if}
												{#if sub.isHidden}<span class="hidden-tag">Oculta</span>{/if}
												{#if sub.isMissing}<span class="hidden-tag">No disponible</span>{/if}
											</span>
											<span class="sub-real">Real: {formatMoney(sub.spentCents)}</span>
										</div>
										<span class="sub-amount">
											{sub.plannedCents > 0 ? formatMoney(sub.plannedCents) : '—'}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- Gasto real sin línea de presupuesto -->
	{#if data.unbudgeted.length > 0}
		<section class="unbudgeted card">
			<h2 class="section-title">Gastos reales sin presupuesto</h2>
			<p class="section-desc">
				Cuentan en el gasto real del ciclo, pero no tienen una línea en el presupuesto. No se les
				asigna un límite ficticio.
			</p>
			<div class="unbudgeted-list">
				{#each data.unbudgeted as item (item.categoryId ?? 'null')}
					<div class="unbudgeted-row">
						<span class="unbudgeted-name">
							{item.name}
							{#if item.isCustom}<span class="custom-tag">Personalizada</span>{/if}
							{#if item.isHidden}<span class="hidden-tag">Oculta</span>{/if}
						</span>
						<span class="unbudgeted-amount">{formatMoney(item.spentCents)}</span>
					</div>
				{/each}
			</div>
			<div class="unbudgeted-total">
				<span>Total sin presupuesto</span>
				<strong>{formatMoney(data.unbudgetedCents)}</strong>
			</div>
		</section>
	{/if}
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

	.preview-banner {
		padding: 0.875rem 1rem;
		margin-bottom: 1.25rem;
		border-style: dashed;
		background: var(--input-bg);
	}

	.preview-banner-title {
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.preview-banner-desc {
		margin-top: 0.25rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--app-text-secondary);
	}

	.preview-banner-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.preview-banner-actions form {
		margin: 0;
	}

	.preview-banner-actions button {
		padding: 0.4375rem 0.75rem;
		font-size: 0.8125rem;
	}

	.month-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		margin-bottom: 1.25rem;
	}

	.month-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		flex-shrink: 0;
		border: none;
		border-radius: var(--radius-md);
		background: var(--input-bg);
		color: var(--app-text);
		font-size: 1.375rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;

		&.disabled {
			opacity: 0.35;
			pointer-events: none;
		}
	}

	.month-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
	}

	.month-select {
		max-width: 100%;
		padding: 0.375rem 0.5rem;
		background: transparent;
		border: none;
		color: var(--app-text);
		font-size: 0.9375rem;
		font-weight: 700;
		text-align: center;
		text-align-last: center;
		cursor: pointer;
		outline: none;
	}

	.period-range {
		font-size: 0.6875rem;
		color: var(--app-text-secondary);
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.month-badges {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem;
		margin-top: 0.125rem;
	}

	.readonly-badge,
	.status-badge {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--app-text-secondary);
		background: var(--input-bg);
		padding: 0.0625rem 0.375rem;
		border-radius: 999px;
	}

	.status-badge.confirmed {
		color: var(--color-primary-700);
		background: var(--color-primary-50);
	}

	.status-badge.draft {
		color: var(--app-text);
		background: var(--input-bg);
		border: 1px dashed var(--app-text-secondary);
	}

	.status-badge.transition {
		color: var(--app-text-secondary);
		background: transparent;
		border: 1px solid var(--color-primary-300);
	}

	.status-badge.empty {
		color: var(--app-text-secondary);
		background: transparent;
		border: 1px solid var(--input-bg);
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

	.draft-hint {
		padding: 0.75rem 1rem;
		margin-bottom: 1.25rem;
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
	}

	.draft-banner {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		margin-bottom: 1.25rem;
		border-style: dashed;
		background: var(--input-bg);
	}

	.draft-banner-copy {
		min-width: 0;
	}

	.draft-banner-title {
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.draft-banner-desc {
		margin-top: 0.25rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--app-text-secondary);
	}

	.discard-btn {
		padding: 0.4375rem 0.75rem;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.summary-card {
		padding: 1.25rem;
		margin-bottom: 1.25rem;
		--pending-text: var(--color-accent-700);
	}

	@media (prefers-color-scheme: dark) {
		.summary-card {
			--pending-text: var(--color-accent-300);
		}
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

	.summary-section {
		& + & {
			margin-top: 1rem;
			padding-top: 1rem;
			border-top: 1px solid var(--app-border);
		}
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.section-heading {
		font-size: 0.875rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.section-caption {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		text-align: right;
		line-height: 1.4;

		strong {
			color: var(--app-text);
			font-variant-numeric: tabular-nums;
			white-space: nowrap;
		}

		&.over {
			color: var(--color-danger-500);
		}
	}

	.plan-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.summary-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--app-text-secondary);
	}

	.summary-value {
		font-size: 1.0625rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;

		&.negative {
			color: var(--color-danger-500);
		}

		&.pending {
			color: var(--pending-text);
		}

		&.muted {
			color: var(--app-text-secondary);
		}
	}

	.execution-amounts {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.exec-right {
		align-items: flex-end;
		text-align: right;
	}

	.execution-balance {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--color-primary-50);
		color: var(--color-primary-700);
		font-size: 0.8125rem;
		font-weight: 600;

		strong {
			font-size: 0.9375rem;
			font-variant-numeric: tabular-nums;
		}

		&.over {
			background: var(--color-danger-50);
			color: var(--color-danger-600);
		}
	}

	.cashflow-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.875rem;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--app-border);
	}

	.cashflow-value {
		font-size: 0.875rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;

		&.positive {
			color: var(--color-primary-600);
		}

		&.negative {
			color: var(--color-danger-500);
		}
	}

	.pending-hint {
		margin-top: 0.5rem;
		color: var(--pending-text);
	}

	.negative-hint {
		margin-top: 0.5rem;
		color: var(--color-danger-500);
	}

	.footnote {
		margin-top: 0.875rem;
		padding-top: 0.75rem;
		border-top: 1px dashed var(--app-border);
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
		line-height: 1.5;
	}

	.unbudgeted-hint {
		margin-top: 0.5rem;
	}

	.copy-form {
		margin-bottom: 1.25rem;
	}

	.copy-hint {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		text-align: center;
		margin-top: 0.375rem;
	}

	.cat-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.hidden-divider {
		padding: 0.5rem 0.125rem 0;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.section-desc {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
		margin-top: 0.125rem;
	}

	.cat-block {
		overflow: hidden;

		&.hidden-line {
			background: color-mix(in srgb, var(--input-bg) 70%, var(--card-bg));
		}

		&.missing-line {
			border-style: dashed;
		}
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

	.custom-tag,
	.hidden-tag {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.0625rem 0.375rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.custom-tag {
		color: var(--color-primary-600);
		background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
	}

	.hidden-tag {
		color: var(--app-text-secondary);
		background: var(--input-bg);
		border: 1px solid var(--app-border);
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

	.meta-tags {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.25rem;
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

		&.static {
			background: transparent;
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

		&.sub-hidden {
			opacity: 0.85;
		}
	}

	.sub-label {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		min-width: 0;
	}

	.sub-name {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.sub-real {
		font-size: 0.6875rem;
		color: var(--app-text-secondary);
	}

	.sub-amount {
		font-size: 0.8125rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--app-text-secondary);
		flex-shrink: 0;
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

	.hide-link {
		background: none;
		border: none;
		padding: 0 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--app-text-secondary);
		cursor: pointer;
		text-decoration: underline;
		white-space: nowrap;

		&:hover {
			color: var(--app-text);
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

	.unbudgeted {
		padding: 1rem;
		margin-bottom: 2rem;
	}

	.unbudgeted-list {
		margin-top: 0.75rem;
	}

	.unbudgeted-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-top: 1px solid var(--app-border);
	}

	.unbudgeted-name {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.unbudgeted-amount {
		font-size: 0.8125rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.unbudgeted-total {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-top: 0.625rem;
		margin-top: 0.25rem;
		border-top: 1px solid var(--app-border);
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.w-full {
		width: 100%;
	}

	@media (max-width: 360px) {
		.plan-grid,
		.cashflow-row {
			grid-template-columns: 1fr;
		}
	}
</style>
