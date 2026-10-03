<script lang="ts">
	/**
	 * Count pill beside a heading or tab — cites the evidence behind it
	 * ("9 of 12 logged", "8 wks"). Counts are labels, not figures, so they
	 * don't take the mono/tabular treatment.
	 */
	let { value }: { value: string | number } = $props();
</script>

<span class="counter">{value}</span>
