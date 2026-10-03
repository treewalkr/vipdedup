<script lang="ts">
	import Button from './Button.svelte';

	/**
	 * Two-step destructive action: first click arms ("Delete"), second click
	 * within `ms` confirms. Auto-resets after the window closes.
	 */
	interface Props {
		label?: string;
		/** Defaults to "Confirm {label}". */
		confirmLabel?: string;
		onconfirm: () => void;
		/** Armed window in ms before auto-reset. */
		ms?: number;
		variant?: 'default' | 'primary' | 'danger' | 'ghost';
		small?: boolean;
		disabled?: boolean;
		/** Extra classes (e.g. "ghost" for the ghost-danger combo). */
		class?: string;
	}

	let {
		label = 'Delete',
		confirmLabel,
		onconfirm,
		ms = 4000,
		variant = 'danger',
		small = false,
		disabled = false,
		class: extra,
	}: Props = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const cls = $derived([armed ? 'armed' : undefined, extra].filter(Boolean).join(' ') || undefined);

	$effect(() => {
		return () => clearTimeout(timer);
	});

	function click() {
		if (armed) {
			clearTimeout(timer);
			armed = false;
			onconfirm();
		} else {
			armed = true;
			timer = setTimeout(() => (armed = false), ms);
		}
	}
</script>

<Button {variant} {small} class={cls} disabled={disabled || undefined} onclick={click}>
	{armed ? (confirmLabel ?? `Confirm ${label.toLowerCase()}`) : label}
</Button>

<style>
	:global(.btn.danger.armed) {
		outline: 2px solid var(--bad);
		outline-offset: 2px;
	}
</style>
