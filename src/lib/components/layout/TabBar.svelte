<script>
	import { page } from '$app/state';

	const tabs = [
		{ href: '/', label: 'Inicio', icon: 'home' },
		{ href: '/movimientos', label: 'Movimientos', icon: 'list' },
		{ href: '/habitos', label: 'Hábitos', icon: 'bar-chart' },
		{ href: '/ajustes', label: 'Ajustes', icon: 'settings' }
	];

	let { onPlusClick = () => {} } = $props();

	function isActive(href) {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<nav class="tab-bar" aria-label="Navegación principal">
	{#each tabs as tab, i}
		{#if i === 2}
			<!-- Botón + central entre Movimientos y Hábitos -->
			<button class="plus-btn" onclick={onPlusClick} aria-label="Nuevo movimiento">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			</button>
		{/if}
		<a
			href={tab.href}
			class="tab-item"
			class:active={isActive(tab.href)}
			aria-current={isActive(tab.href) ? 'page' : undefined}
		>
			<span class="tab-icon">
				{#if tab.icon === 'home'}
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
						<polyline points="9 22 9 12 15 12 15 22" />
					</svg>
				{:else if tab.icon === 'list'}
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<line x1="8" y1="6" x2="21" y2="6" />
						<line x1="8" y1="12" x2="21" y2="12" />
						<line x1="8" y1="18" x2="21" y2="18" />
						<line x1="3" y1="6" x2="3.01" y2="6" />
						<line x1="3" y1="12" x2="3.01" y2="12" />
						<line x1="3" y1="18" x2="3.01" y2="18" />
					</svg>
				{:else if tab.icon === 'bar-chart'}
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="20" x2="18" y2="10" />
						<line x1="12" y1="20" x2="12" y2="4" />
						<line x1="6" y1="20" x2="6" y2="14" />
					</svg>
				{:else if tab.icon === 'settings'}
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
					</svg>
				{/if}
			</span>
			<span class="tab-label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.tab-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: flex-end;
		justify-content: space-around;
		background: var(--tab-bar-bg);
		border-top: 1px solid var(--app-border);
		padding-bottom: env(safe-area-inset-bottom, 0);
		z-index: 50;
		height: 4rem;
	}

	.tab-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.125rem;
		flex: 1;
		padding: 0.5rem 0;
		text-decoration: none;
		color: var(--app-text-secondary);
		transition: color 150ms ease;
		min-height: 2.75rem;
		-webkit-tap-highlight-color: transparent;
	}

	.tab-item.active {
		color: var(--color-primary-500);
	}

	.tab-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
	}

	.tab-label {
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.plus-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.25rem;
		height: 3.25rem;
		background: var(--color-primary-500);
		color: white;
		border-radius: 50%;
		border: 4px solid var(--tab-bar-bg);
		cursor: pointer;
		margin-bottom: 0.75rem;
		box-shadow: var(--shadow-elevated);
		transition: background 150ms ease, transform 100ms ease;
		flex-shrink: 0;
	}

	.plus-btn:hover {
		background: var(--color-primary-600);
	}

	.plus-btn:active {
		transform: scale(0.95);
	}
</style>
