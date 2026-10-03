<script lang="ts">
	import type { Snippet } from 'svelte';
	import Crumbs from './Crumbs.svelte';

	/**
	 * Page opener: optional crumbs, headline (+ optional suffix snippet for
	 * status pills), `.sub` context line, and right-aligned actions.
	 */
	interface Crumb {
		href?: string;
		label: string;
	}

	interface Props {
		title: string;
		sub?: string;
		crumbs?: Crumb[];
		/** Inline suffix inside the h1 (e.g. a StatusPill). */
		titleSuffix?: Snippet;
		actions?: Snippet;
	}

	let { title, sub, crumbs, titleSuffix, actions }: Props = $props();
</script>

<div class="page-head">
	{#if crumbs}<Crumbs items={crumbs} />{/if}
	<h1>
		{title}
		{@render titleSuffix?.()}
	</h1>
	{#if sub}<p class="sub">{sub}</p>{/if}
	{#if actions}<div class="head-actions">{@render actions()}</div>{/if}
</div>

<style>
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>
