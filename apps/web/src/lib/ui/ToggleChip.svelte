<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Hairline pill that inverts to Inverted Ink when selected. Controlled:
	 * the parent owns state (`on`) and toggles in `onclick`.
	 */
	interface Props {
		on?: boolean;
		onclick?: () => void;
		children?: Snippet;
	}

	let { on = false, onclick, children, ...rest }: Props & HTMLButtonAttributes = $props();
</script>

<button type="button" class="tchip" class:on aria-pressed={on} onclick={() => onclick?.()} {...rest}>
	{@render children?.()}
</button>
