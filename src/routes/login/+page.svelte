<script>
	import { enhance } from '$app/forms';

	let loading = $state(false);
</script>

<svelte:head>
	<title>Iniciar sesión — contlana</title>
</svelte:head>

<div class="login-wrapper">
	<div class="login-card card">
		<div class="brand">
			<div class="logo">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
				</svg>
			</div>
			<h1 class="title">contlana</h1>
			<p class="subtitle">Controla tus gastos cotidianos y entiende en qué hábitos se te va el dinero.</p>
		</div>

		<form
			method="post"
			action="?/signInSocial"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="form"
		>
			<input type="hidden" name="provider" value="google" />
			<input type="hidden" name="callbackURL" value="/" />

			<button type="submit" class="google-btn" disabled={loading}>
				<svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
					<path
						fill="#4285F4"
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					/>
					<path
						fill="#34A853"
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					/>
					<path
						fill="#FBBC05"
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
					/>
					<path
						fill="#EA4335"
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
					/>
				</svg>
				<span>{loading ? 'Conectando...' : 'Continuar con Google'}</span>
			</button>
		</form>

		<p class="privacy-note">
			Al continuar aceptas el registro de tus compras para análisis personal. Tus datos son privados.
		</p>
	</div>
</div>

<style>
	.login-wrapper {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 1rem;
		background: var(--app-bg);
	}

	.login-card {
		width: 100%;
		max-width: 26rem;
		padding: 2.5rem 1.75rem;
		text-align: center;
	}

	.brand {
		margin-bottom: 2rem;
	}

	.logo {
		width: 4rem;
		height: 4rem;
		margin: 0 auto 1.25rem;
		background: var(--color-primary-500);
		color: white;
		border-radius: var(--radius-2xl);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 16px -4px rgba(34, 135, 76, 0.3);
	}

	.title {
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--app-text);
		margin-bottom: 0.5rem;
	}

	.subtitle {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--app-text-secondary);
	}

	.form {
		margin-bottom: 1.5rem;
	}

	.google-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--card-bg);
		color: var(--app-text);
		border: 1px solid var(--app-border);
		border-radius: var(--radius-xl);
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease;
		box-shadow: var(--shadow-card);
		min-height: 3rem;

		&:hover {
			background: var(--color-surface-100);
			border-color: var(--color-surface-300);
		}

		&:active {
			transform: scale(0.99);
		}

		&:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}
	}

	.google-icon {
		flex-shrink: 0;
	}

	.privacy-note {
		font-size: 0.75rem;
		color: var(--app-text-secondary);
		line-height: 1.4;
	}
</style>
