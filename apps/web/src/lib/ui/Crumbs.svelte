<script lang="ts">
	/**
	 * Breadcrumb trail. The last item without an `href` renders as the plain
	 * current segment ("Client / Log session").
	 */
	interface Crumb {
		href?: string;
		label: string;
	}

	let { items = [] }: { items?: Crumb[] } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<p class="crumbs">
	{#each items as c, i (i)}
		{#if i > 0}<span class="sep" aria-hidden="true"> / </span>{/if}
		{#if c.href}<a href={c.href}>{c.label}</a>{:else}{c.label}{/if}
	{/each}
</p>

<style>
	.crumbs {
		margin: 0 0 4px;
		font-size: 13px;
		color: var(--faint);
	}
	.crumbs a:hover { text-decoration: underline; }
</style>
