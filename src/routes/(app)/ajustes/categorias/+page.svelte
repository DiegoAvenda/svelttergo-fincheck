<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let showNewModal = $state(false);
	let newName = $state('');
	let newParentId = $state('');

	let editingId = $state(null);
	let editingName = $state('');

	function startEditing(cat) {
		editingId = cat.id;
		editingName = cat.name;
	}

	function cancelEditing() {
		editingId = null;
		editingName = '';
	}
</script>

<svelte:head>
	<title>Categorías — Ajustes — contlana</title>
</svelte:head>

<div class="categories-page">
	<div class="top-bar">
		<a href="/ajustes" class="back-link" aria-label="Volver a ajustes">
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
		<h1 class="page-title">Categorías</h1>
		<button
			type="button"
			class="add-btn"
			onclick={() => (showNewModal = !showNewModal)}
			aria-label="Nueva categoría"
		>
			+ Nueva
		</button>
	</div>

	{#if form?.error}
		<div class="error-banner card">
			<p>{form.error}</p>
		</div>
	{/if}

	<!-- Formulario para crear categoría -->
	{#if showNewModal}
		<div class="new-cat-card card">
			<h3 class="new-title">Crear categoría o subcategoría</h3>
			<form
				method="post"
				action="?/create"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							showNewModal = false;
							newName = '';
							newParentId = '';
						}
						await update();
					};
				}}
				class="new-form"
			>
				<div class="field">
					<label for="newCatName" class="field-label">Nombre</label>
					<input
						type="text"
						id="newCatName"
						name="name"
						bind:value={newName}
						placeholder="Ej. Mascotas, Libros, Streaming"
						class="input-field"
						required
						autofocus
					/>
				</div>

				<div class="field">
					<label for="newCatParent" class="field-label">Pertenece a (opcional)</label>
					<select id="newCatParent" name="parentId" bind:value={newParentId} class="input-field">
						<option value="">Categoría principal (sin padre)</option>
						{#each data.parentOptions as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>

				<div class="new-actions">
					<button type="button" class="btn-secondary" onclick={() => (showNewModal = false)}>
						Cancelar
					</button>
					<button type="submit" class="btn-primary"> Guardar categoría </button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Lista jerárquica de categorías -->
	<div class="tree-list">
		{#each data.categoriesTree as parent (parent.id)}
			<div class="parent-card card" class:hidden-cat={parent.isHidden}>
				<div class="parent-row">
					<div class="cat-left">
						{#if editingId === parent.id}
							<form
								method="post"
								action="?/rename"
								use:enhance={() => {
									return async ({ update }) => {
										cancelEditing();
										await update();
									};
								}}
								class="rename-form"
							>
								<input type="hidden" name="id" value={parent.id} />
								<input
									type="text"
									name="name"
									bind:value={editingName}
									class="rename-input"
									required
								/>
								<button type="submit" class="btn-inline save">✓</button>
								<button type="button" class="btn-inline cancel" onclick={cancelEditing}>✕</button>
							</form>
						{:else}
							<span class="cat-name">{parent.name}</span>
							{#if parent.isCustom}
								<span class="custom-badge">Personalizada</span>
							{/if}
							{#if parent.isHidden}
								<span class="hidden-badge">Oculta</span>
							{/if}
						{/if}
					</div>

					<div class="cat-actions">
						<!-- Favorita -->
						<form method="post" action="?/toggleFavorite" use:enhance>
							<input type="hidden" name="id" value={parent.id} />
							<input type="hidden" name="current" value={parent.isFavorite} />
							<button
								type="submit"
								class="icon-action-btn"
								class:active={parent.isFavorite}
								title="Marcar favorita"
							>
								{parent.isFavorite ? '★' : '☆'}
							</button>
						</form>

						{#if parent.isCustom}
						<!-- Ocultar -->
						<form method="post" action="?/toggleHidden" use:enhance>
							<input type="hidden" name="id" value={parent.id} />
							<input type="hidden" name="current" value={parent.isHidden} />
							<button
								type="submit"
								class="icon-action-btn"
								title={parent.isHidden ? 'Mostrar' : 'Ocultar'}
							>
								{#if parent.isHidden}
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
										/>
										<line x1="1" y1="1" x2="23" y2="23" />
									</svg>
								{:else}
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
										<circle cx="12" cy="12" r="3" />
									</svg>
								{/if}
							</button>
						</form>
						{/if}

						{#if parent.isCustom}
							<!-- Editar nombre -->
							<button
								type="button"
								class="icon-action-btn"
								onclick={() => startEditing(parent)}
								title="Renombrar"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
								</svg>
							</button>

							<!-- Eliminar -->
							<form method="post" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={parent.id} />
								<button
									type="submit"
									class="icon-action-btn danger"
									title={parent.hasReferences
										? 'No se puede eliminar: tiene movimientos o presupuesto guardado. Usa Ocultar.'
										: 'Eliminar'}
									disabled={parent.hasReferences}
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="3 6 5 6 21 6" />
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
									</svg>
								</button>
							</form>
						{/if}
					</div>
				</div>

				<!-- Subcategorías -->
				{#if parent.subcategories.length > 0}
					<div class="subs-container">
						{#each parent.subcategories as sub (sub.key)}
							<div class="sub-row" class:hidden-cat={sub.isHidden}>
								<div class="cat-left">
									<span class="sub-bullet">└</span>
									{#if sub.isCustom && editingId === sub.id}
										<form
											method="post"
											action="?/rename"
											use:enhance={() => {
												return async ({ update }) => {
													cancelEditing();
													await update();
												};
											}}
											class="rename-form"
										>
											<input type="hidden" name="id" value={sub.id} />
											<input
												type="text"
												name="name"
												bind:value={editingName}
												class="rename-input"
												required
											/>
											<button type="submit" class="btn-inline save">✓</button>
											<button type="button" class="btn-inline cancel" onclick={cancelEditing}
												>✕</button
											>
										</form>
									{:else}
										<span class="sub-name">{sub.name}</span>
										{#if sub.isCustom}
											<span class="custom-badge">Personalizada</span>
										{/if}
										{#if sub.isHidden}
											<span class="hidden-badge">Oculta</span>
										{/if}
									{/if}
								</div>

								{#if sub.isCustom}
									<div class="cat-actions">
										<form method="post" action="?/toggleHidden" use:enhance>
											<input type="hidden" name="id" value={sub.id} />
											<input type="hidden" name="current" value={sub.isHidden} />
											<button
												type="submit"
												class="icon-action-btn"
												title={sub.isHidden ? 'Mostrar' : 'Ocultar'}
											>
												{#if sub.isHidden}
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
													>
														<path
															d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
														/>
														<path
															d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
														/>
														<line x1="1" y1="1" x2="23" y2="23" />
													</svg>
												{:else}
													<svg
														width="14"
														height="14"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
													>
														<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
														<circle cx="12" cy="12" r="3" />
													</svg>
												{/if}
											</button>
										</form>

										<button
											type="button"
											class="icon-action-btn"
											onclick={() => startEditing(sub)}
											title="Renombrar"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
											</svg>
										</button>

										<form method="post" action="?/delete" use:enhance>
											<input type="hidden" name="id" value={sub.id} />
											<button
												type="submit"
												class="icon-action-btn danger"
												title={sub.hasReferences
													? 'No se puede eliminar: tiene movimientos o presupuesto guardado. Usa Ocultar.'
													: 'Eliminar'}
												disabled={sub.hasReferences}
											>
												<svg
													width="14"
													height="14"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<polyline points="3 6 5 6 21 6" />
													<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
												</svg>
											</button>
										</form>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.categories-page {
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

	.add-btn {
		background: var(--color-primary-500);
		color: white;
		border: none;
		padding: 0.5rem 0.875rem;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
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

	.new-cat-card {
		padding: 1.25rem;
		margin-bottom: 1.25rem;
		border: 2px solid var(--color-primary-400);
	}

	.new-title {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 1rem;
	}

	.new-form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--app-text);
	}

	.new-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.tree-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.parent-card {
		overflow: hidden;

		&.hidden-cat {
			opacity: 0.6;
		}
	}

	.parent-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.125rem;
		gap: 0.75rem;
	}

	.cat-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.cat-name {
		font-size: 0.9375rem;
		font-weight: 700;
	}

	.hidden-badge {
		font-size: 0.6875rem;
		background: var(--color-surface-200);
		color: var(--app-text-secondary);
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
	}

	.custom-badge {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-primary-600);
		background: color-mix(in srgb, var(--color-primary-500) 12%, transparent);
		padding: 0.0625rem 0.375rem;
		border-radius: 999px;
	}

	.cat-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.icon-action-btn {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: var(--radius-md);
		color: var(--app-text-secondary);
		cursor: pointer;
		font-size: 1.125rem;

		&:hover {
			background: var(--color-surface-100);
			color: var(--app-text);
		}

		&.active {
			color: #f59e0b;
		}

		&.danger:hover {
			color: var(--color-danger-500);
			background: var(--color-danger-50);
		}

		&:disabled,
		&:disabled:hover {
			opacity: 0.35;
			cursor: not-allowed;
			background: none;
			color: var(--app-text-secondary);
		}
	}

	.subs-container {
		background: var(--input-bg);
		border-top: 1px solid var(--app-border);
		padding: 0.25rem 0;
	}

	.sub-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1.125rem 0.5rem 1.75rem;
		gap: 0.5rem;

		&.hidden-cat {
			opacity: 0.6;
		}
	}

	.sub-bullet {
		color: var(--app-text-secondary);
		font-size: 0.8125rem;
	}

	.sub-name {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.rename-form {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex: 1;
	}

	.rename-input {
		flex: 1;
		padding: 0.25rem 0.5rem;
		background: var(--card-bg);
		border: 1px solid var(--color-primary-400);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		color: var(--app-text);
	}

	.btn-inline {
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 700;
		border: none;
		cursor: pointer;

		&.save {
			background: var(--color-primary-500);
			color: white;
		}

		&.cancel {
			background: var(--color-surface-200);
			color: var(--app-text);
		}
	}
</style>
