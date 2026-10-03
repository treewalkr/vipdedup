<script lang="ts">
	import Counter from './Counter.svelte';
	/**
	 * Orange-underline tabs over the global `.tabs` styles. Buttons get
	 * `id="{idPrefix}-{tabId}"` and point at `panel-{tabId}` panels —
	 * render matching `role="tabpanel" aria-labelledby` panels yourself.
	 */
	interface TabItem {
		id: string;
		label: string;
		/** Counter pill citing the tab's evidence ("8 wks"). */
		count?: string;
		disabled?: boolean;
	}

	interface Props {
		items: TabItem[];
		value: string;
		onchange?: (id: string) => void;
		/** Accessible name for the tablist. */
		label?: string;
		idPrefix?: string;
	}

	let { items, value, onchange, label, idPrefix = 'tab' }: Props = $props();
</script>

<div class="tabs" role="tablist" aria-label={label}>
	{#each items as t (t.id)}
		<button
			type="button"
			id={`${idPrefix}-${t.id}`}
			role="tab"
			class:on={value === t.id}
			aria-selected={value === t.id}
			aria-controls={`panel-${t.id}`}
			disabled={t.disabled}
			onclick={() => onchange?.(t.id)}
		>
			{t.label}
			{#if t.count}<Counter value={t.count} />{/if}
		</button>
	{/each}
</div>
