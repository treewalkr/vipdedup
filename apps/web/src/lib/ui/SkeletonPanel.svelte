<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	/** The loading-state panel: body + shimmer block, matching loaded layout. */
	let { height = 80 }: { height?: number } = $props();
</script>

<div class="panel">
	<div class="panel-body">
		<Skeleton h={`${height}px`} />
	</div>
</div>
