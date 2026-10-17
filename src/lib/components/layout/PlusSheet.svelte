<script>
	let { open = $bindable(false) } = $props();

	function close() {
		open = false;
	}

	function onBackdropClick() {
		close();
	}

	function onKeydown(e) {
		if (e.key === 'Escape') close();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={onBackdropClick} onkeydown={onKeydown}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="sheet" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="sheet-handle"></div>
			<div class="sheet-content">
				<h2 class="sheet-title">Nuevo movimiento</h2>
				<div class="sheet-options">
					<a href="/registrar" class="sheet-option" onclick={close}>
						<span class="sheet-option-icon" style="background: var(--color-primary-500);">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
						</span>
						<div>
							<span class="sheet-option-label">Registrar</span>
							<span class="sheet-option-desc">Ingreso o gasto rápido</span>
						</div>
					</a>
					<a href="/escanear" class="sheet-option" onclick={close}>
						<span class="sheet-option-icon" style="background: var(--color-accent-500);">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="3" width="18" height="18" rx="2" />
								<line x1="7" y1="8" x2="17" y2="8" />
								<line x1="7" y1="12" x2="17" y2="12" />
								<line x1="7" y1="16" x2="13" y2="16" />
							</svg>
						</span>
						<div>
							<span class="sheet-option-label">Escanear ticket</span>
							<span class="sheet-option-desc">Foto de tu recibo de compra</span>
						</div>
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 100;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: fadeIn 200ms ease;
	}

	.sheet {
		background: var(--sheet-bg);
		border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
		width: 100%;
		max-width: 32rem;
		padding: 0.75rem 1.5rem 2rem;
		animation: slideUp 250ms cubic-bezier(0.16, 1, 0.3, 1);
		padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0));
	}

	.sheet-handle {
		width: 2.5rem;
		height: 0.25rem;
		background: var(--app-border);
		border-radius: 9999px;
		margin: 0 auto 1.25rem;
	}

	.sheet-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 1rem;
	}

	.sheet-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.sheet-option {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--input-bg);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--app-text);
		transition: background 150ms ease;
		min-height: 4rem;
	}

	.sheet-option:hover {
		background: var(--color-surface-200);
	}

	.sheet-option-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: var(--radius-lg);
		flex-shrink: 0;
	}

	.sheet-option-label {
		display: block;
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.sheet-option-desc {
		display: block;
		font-size: 0.8125rem;
		color: var(--app-text-secondary);
		margin-top: 0.125rem;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideUp {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
</style>
