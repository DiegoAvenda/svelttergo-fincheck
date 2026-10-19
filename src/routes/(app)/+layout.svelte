<script>
	import TabBar from '$lib/components/layout/TabBar.svelte';
	import PlusSheet from '$lib/components/layout/PlusSheet.svelte';

	let { children } = $props();
	let plusOpen = $state(false);
</script>

<div class="app-layout">
	<main class="app-main">
		{@render children()}
	</main>

	<TabBar onPlusClick={() => (plusOpen = true)} />
	<PlusSheet bind:open={plusOpen} />
</div>

<style>
	.app-layout {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--app-bg);
		color: var(--app-text);
	}

	.app-main {
		flex: 1;
		width: 100%;
		max-width: 32rem;
		margin: 0 auto;
		padding: calc(5.5rem + env(safe-area-inset-top, 0)) 1rem 1rem;
	}
</style>
