<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Primer button over the global `.btn` classes. `variant="primary"` is
	 * reserved for the verb that advances the review flow (one green action
	 * per screen state).
	 */
	type Variant = 'default' | 'primary' | 'danger' | 'ghost';

	interface Props {
		variant?: Variant;
		small?: boolean;
		/** Renders an `<a>` instead of `<button>`. */
		href?: string;
		/** Decorative icon rendered before the label; size via `.btn svg`. */
		icon?: Snippet;
		children?: Snippet;
	}

	type Rest = Omit<HTMLAnchorAttributes, 'href'> & HTMLButtonAttributes;

	let { variant = 'default', small = false, href, icon, children, class: cls, ...rest }: Props & Rest = $props();

	const classes = $derived(['btn', variant !== 'default' ? variant : '', small ? 'small' : '', cls].filter(Boolean).join(' '));
</script>

{#if href}
	<a {href} class={classes} {...rest}>
		{@render icon?.()}
		{@render children?.()}
	</a>
{:else}
	<button class={classes} {...rest}>
		{@render icon?.()}
		{@render children?.()}
	</button>
{/if}
