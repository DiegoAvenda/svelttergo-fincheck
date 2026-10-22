<script>
	/**
	 * Marca de la app (símbolo + nombre) para encabezados, navegación y auth.
	 * @typedef {'sm' | 'md' | 'lg'} BrandSize
	 * @type {{ size?: BrandSize }}
	 */
	let { size = 'md' } = $props();
</script>

<span class="brand" data-size={size}>
	<span class="brand-mark" aria-hidden="true">
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
		</svg>
	</span>
	<span class="brand-name">NAVEDDY</span>
</span>

<style>
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--app-text);
	}

	.brand-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		background: var(--color-primary-500);
		color: white;
		border-radius: var(--radius-md);
		box-shadow: 0 4px 10px -4px rgba(59, 130, 246, 0.55);
	}

	.brand-mark svg {
		width: 62%;
		height: 62%;
	}

	.brand-name {
		font-size: 1.0625rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
	}

	.brand[data-size='sm'] .brand-mark {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-sm);
	}

	.brand[data-size='sm'] .brand-name {
		font-size: 0.9375rem;
	}

	.brand[data-size='lg'] .brand-mark {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-lg);
	}

	.brand[data-size='lg'] .brand-name {
		font-size: 1.375rem;
	}
</style>
