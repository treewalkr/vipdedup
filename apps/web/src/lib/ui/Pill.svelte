<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Primer Label: ink-on-tint status pill (99px, 12px/500). Domain statuses
	 * map onto these four tones (see StatusPill).
	 */
	type Tone = 'good' | 'warn' | 'bad' | 'neutral';

	interface Props {
		tone?: Tone;
		children?: Snippet;
	}

	let { tone = 'neutral', children }: Props = $props();
</script>

<span class="pill {tone}">{@render children?.()}</span>
