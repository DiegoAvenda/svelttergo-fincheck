<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let monthlyIncome = $state(data.settings.monthlyIncomePesos);
	let currency = $state(data.settings.currency);
	let monthStartDay = $state(data.settings.monthStartDay);
	let incomeType = $state(data.settings.incomeType || '');
	let saving = $state(false);
	let loggingOut = $state(false);
</script>

<svelte:head>
	<title>Ajustes — contlana</title>
</svelte:head>

<div class="settings-page">
	<div class="header">
		<h1 class="page-title">Ajustes</h1>
		<p class="subtitle">Preferencias de cuenta y configuración de finanzas.</p>
	</div>

	{#if form?.success}
		<div class="success-banner card">Ajustes guardados correctamente</div>
	{/if}

	<!-- Perfil de usuario -->
	<div class="profile-card card">
		<div class="avatar">
			{#if data.user.image}
				<img src={data.user.image} alt={data.user.name} class="avatar-img" />
			{:else}
				<span class="avatar-initial">{(data.user.name || 'U')[0].toUpperCase()}</span>
			{/if}
		</div>
		<div class="profile-info">
			<span class="user-name">{data.user.name || 'Usuario'}</span>
			<span class="user-email">{data.user.email}</span>
		</div>
	</div>

	<!-- Menú de navegación de ajustes -->
	<div class="nav-card card">
		<a href="/presupuesto" class="nav-item">
			<div class="nav-left">
				<div class="nav-icon">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M3 3v18h18" />
						<path d="M7 14l4-4 3 3 5-6" />
					</svg>
				</div>
				<div>
					<span class="nav-title">Presupuesto mensual</span>
					<span class="nav-sub">Planea cuánto gastar por categoría</span>
				</div>
			</div>
			<span class="chevron">›</span>
		</a>

		<div class="divider"></div>

		<a href="/ajustes/categorias" class="nav-item">
			<div class="nav-left">
				<div class="nav-icon">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="3" y="3" width="7" height="7" />
						<rect x="14" y="3" width="7" height="7" />
						<rect x="14" y="14" width="7" height="7" />
						<rect x="3" y="14" width="7" height="7" />
					</svg>
				</div>
				<div>
					<span class="nav-title">Categorías de gasto</span>
					<span class="nav-sub">Crear, renombrar, favoritas y ocultar</span>
				</div>
			</div>
			<span class="chevron">›</span>
		</a>

		<div class="divider"></div>

		<!-- TODO: ocultar exportar hasta mejorar el flujo de Excel -->
		<!-- <a href="/ajustes/exportar" class="nav-item"> ... </a> -->
	</div>

	<!-- Formulario de preferencias -->
	<form
		method="post"
		action="?/saveSettings"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update();
			};
		}}
		class="form"
	>
		<div class="form-card card">
			<h2 class="section-title">Preferencias de cálculo</h2>

			<div class="field">
				<label for="monthlyIncome" class="field-label">Ingreso mensual de referencia ($ MXN)</label>
				<input
					type="text"
					inputmode="decimal"
					id="monthlyIncome"
					name="monthlyIncome"
					bind:value={monthlyIncome}
					placeholder="Ej. 18000"
					class="input-field"
				/>
				<span class="field-hint">Referencia para % de gastos. No crea ingresos reales.</span>
			</div>

			<div class="field">
				<label for="incomeType" class="field-label">Tipo de ingresos</label>
				<select id="incomeType" name="incomeType" bind:value={incomeType} class="input-field">
					<option value="">Prefiero no definirlo</option>
					<option value="fixed">Fijos o recurrentes</option>
					<option value="variable">Variables</option>
				</select>
				<span class="field-hint">Si es fijo, se precarga; si variable, solo referencia.</span>
			</div>

			<div class="field">
				<label for="monthStartDay" class="field-label">Día de inicio del ciclo</label>
				<select
					id="monthStartDay"
					name="monthStartDay"
					bind:value={monthStartDay}
					class="input-field"
				>
					{#each Array.from({ length: 28 }, (_, i) => i + 1) as day (day)}
						<option value={day}>Día {day} de cada mes</option>
					{/each}
				</select>
				<span class="field-hint">1–28. Se aplica al siguiente ciclo; no cambia los guardados.</span>
			</div>

			<div class="field">
				<label for="currency" class="field-label">Moneda</label>
				<input
					type="text"
					id="currency"
					name="currency"
					value={currency}
					readonly
					class="readonly input-field"
				/>
			</div>

			<button type="submit" class="mt-2 btn-primary w-full" disabled={saving}>
				{saving ? 'Guardando...' : 'Guardar preferencias'}
			</button>
		</div>
	</form>

	<!-- Cerrar sesión -->
	<div class="logout-section">
		<form
			method="post"
			action="?/signOut"
			use:enhance={() => {
				loggingOut = true;
			}}
		>
			<button type="submit" class="logout-btn" disabled={loggingOut}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
				<span>{loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
			</button>
		</form>
	</div>
</div>

<style>
	.settings-page {
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

	.profile-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.avatar {
		width: 3.25rem;
		height: 3.25rem;
		border-radius: 50%;
		overflow: hidden;
		background: var(--color-primary-500);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initial {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.profile-info {
		min-width: 0;
	}

	.user-name {
		display: block;
		font-size: 1.0625rem;
		font-weight: 700;
	}

	.user-email {
		display: block;
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		margin-top: 0.125rem;
	}

	.nav-card {
		overflow: hidden;
		margin-bottom: 1.25rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		text-decoration: none;
		color: var(--app-text);
		transition: background 150ms ease, box-shadow 150ms ease;
		border-radius: var(--radius-md);

		&:hover {
			background: var(--color-surface-100);
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
		}
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.nav-icon {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-md);
		background: var(--input-bg);
		color: var(--app-text);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.nav-title {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.nav-sub {
		display: block;
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		margin-top: 0.125rem;
	}

	.chevron {
		font-size: 1.25rem;
		color: var(--app-text-secondary);
	}

	.divider {
		height: 1px;
		background: var(--app-border);
		margin-left: 4.25rem;
	}

	.form-card {
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 1.25rem;
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text);
	}

	.field-hint {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		line-height: 1.4;
	}

	.readonly {
		opacity: 0.7;
		cursor: default;
	}

	.logout-section {
		text-align: center;
		margin-top: 1rem;
		margin-bottom: 2rem;
	}

	.logout-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: 1px solid var(--app-border);
		color: var(--color-danger-500);
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.75rem 1.5rem;
		border-radius: var(--radius-xl);
		cursor: pointer;
		transition: all 150ms ease;

		&:hover {
			background: var(--color-danger-50);
		}
	}

	.w-full {
		width: 100%;
	}

	.mt-2 {
		margin-top: 0.5rem;
	}
</style>
