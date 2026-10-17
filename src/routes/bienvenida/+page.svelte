<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let income = $state(form?.values?.monthlyIncome ?? '');
	let submitting = $state(false);
</script>

<svelte:head>
	<title>¡Te damos la bienvenida! — Fincheck</title>
</svelte:head>

<div class="welcome-wrapper">
	<div class="welcome-card card">
		<div class="header">
			<div class="badge">Paso 1 de 1</div>
			<h1 class="title">¡Hola, {data.user.name || 'amigo'}!</h1>
			<p class="subtitle">
				Para calcular qué porcentaje de tu dinero se va en cada hábito de consumo, necesitamos un dato aproximado.
			</p>
		</div>

		<form
			method="post"
			action="?/save"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
			class="form"
		>
			<div class="field">
				<label for="monthlyIncome" class="label">Tu ingreso mensual aproximado</label>
				<div class="input-wrapper">
					<span class="currency-prefix">$</span>
					<input
						type="text"
						inputmode="decimal"
						id="monthlyIncome"
						name="monthlyIncome"
						bind:value={income}
						placeholder="0.00"
						class="income-input"
						autofocus
					/>
					<span class="currency-suffix">MXN</span>
				</div>
				{#if form?.error}
					<p class="error-msg">{form.error}</p>
				{/if}
				<p class="hint">Es solo una referencia personal. Podrás cambiarlo o ajustarlo en cualquier momento.</p>
			</div>

			<div class="actions">
				<button type="submit" class="btn-primary w-full" disabled={submitting}>
					{submitting ? 'Guardando...' : 'Comenzar'}
				</button>
			</div>
		</form>

		<form
			method="post"
			action="?/skip"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
			class="skip-form"
		>
			<button type="submit" class="skip-btn" disabled={submitting}>
				Omitir por ahora
			</button>
		</form>
	</div>
</div>

<style>
	.welcome-wrapper {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 1rem;
		background: var(--app-bg);
	}

	.welcome-card {
		width: 100%;
		max-width: 28rem;
		padding: 2.25rem 1.75rem;
	}

	.badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-primary-600);
		background: var(--color-primary-50);
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-full);
		margin-bottom: 0.75rem;
	}

	.title {
		font-size: 1.625rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--app-text);
		margin-bottom: 0.5rem;
	}

	.subtitle {
		font-size: 0.9375rem;
		color: var(--app-text-secondary);
		line-height: 1.5;
		margin-bottom: 2rem;
	}

	.field {
		margin-bottom: 1.75rem;
	}

	.label {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--app-text);
		margin-bottom: 0.5rem;
	}

	.input-wrapper {
		display: flex;
		align-items: center;
		background: var(--input-bg);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-xl);
		padding: 0.5rem 1rem;
		transition: border-color 150ms ease, box-shadow 150ms ease;

		&:focus-within {
			border-color: var(--color-primary-400);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary-400) 20%, transparent);
		}
	}

	.currency-prefix {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--app-text-secondary);
		margin-right: 0.25rem;
	}

	.currency-suffix {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text-secondary);
		margin-left: 0.5rem;
	}

	.income-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--app-text);
		font-variant-numeric: tabular-nums;
		min-width: 0;

		&::placeholder {
			color: var(--color-surface-400);
		}
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		margin-top: 0.5rem;
		line-height: 1.4;
	}

	.error-msg {
		font-size: 0.8125rem;
		color: var(--color-danger-500);
		margin-top: 0.375rem;
		font-weight: 500;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.w-full {
		width: 100%;
	}

	.skip-form {
		margin-top: 0.75rem;
		text-align: center;
	}

	.skip-btn {
		background: none;
		border: none;
		color: var(--app-text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		transition: color 150ms ease;

		&:hover {
			color: var(--app-text);
		}
	}
</style>
