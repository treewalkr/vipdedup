<script lang="ts">
	/** Loading placeholder bar — shimmer honors prefers-reduced-motion. */
	interface Props {
		/** CSS size, e.g. "80px" or "40%". */
		w?: string;
		h?: string;
	}

	let { w, h }: Props = $props();
</script>

<div class="skeleton" style:width={w} style:height={h}></div>
