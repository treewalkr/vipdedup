<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Counter from './Counter.svelte';

	/**
	 * Primer Box: canvas-white surface on a hairline border, 6px radius.
	 * Optional well head (title + evidence counter + right-aligned `act`
	 * snippet). Body content is passed through as-is — wrap tables in
	 * `<div class="panel-body tight">` yourself. Extra attributes (id,
	 * role, aria-*) land on the section.
	 */
	interface Props {
		title?: string;
		/** Evidence counter next to the title ("9 of 12 logged"). */
		count?: string | number;
		/** Right-aligned head content — render `<a class="act">` inside. */
		act?: Snippet;
		children?: Snippet;
		/** Extra classes (e.g. layout variants). */
		class?: string;
	}

	let { title, count, act, children, class: cls, ...rest }: Props & HTMLAttributes<HTMLElement> = $props();
</script>

<section class={['panel', cls]} {...rest}>
	{#if title || act}
		<div class="panel-head">
			{#if title}<h2>{title}</h2>{/if}
			{#if count}<Counter value={count} />{/if}
			{@render act?.()}
		</div>
	{/if}
	{@render children?.()}
</section>
