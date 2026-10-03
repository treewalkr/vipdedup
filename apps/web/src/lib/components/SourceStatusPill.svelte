<script lang="ts">
  import type { SourceStatusDto } from "@vd/shared";
  import Pill from "$lib/ui/Pill.svelte";

  /** Availability + last-scan outcome, condensed to Primer pills. */
  let { status }: { status: SourceStatusDto } = $props();
</script>

<span class="pills">
  {#if status.scanning}
    <Pill tone="warn">scanning</Pill>
  {:else if !status.online}
    <Pill tone="bad">offline</Pill>
  {:else}
    <Pill tone="good">online</Pill>
  {/if}
  {#if !status.scanning && status.lastScan}
    {#if status.lastScan.status === "ok"}
      <Pill tone="neutral">scanned</Pill>
    {:else if status.lastScan.status === "running"}
      <Pill tone="warn">running</Pill>
    {:else}
      <Pill tone="bad">{status.lastScan.status}</Pill>
    {/if}
  {/if}
</span>

<style>
  .pills {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
