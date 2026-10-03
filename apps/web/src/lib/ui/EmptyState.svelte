<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Centered muted empty-state message, with optional centered on-ramp
	 * actions when the empty state is an entry point.
	 */
	interface Props {
		children?: Snippet;
		/** Centered actions below the message (e.g. "Generate first program"). */
		actions?: Snippet;
	}

	let { children, actions }: Props = $props();
</script>

<div class="empty">
	{@render children?.()}
	{#if actions}
		<div class="empty-actions">{@render actions()}</div>
	{/if}
</div>

<style>
	.empty-actions {
		margin-top: 12px;
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
	}
</style>
