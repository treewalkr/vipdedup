<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { formatBytes, relTime } from "$lib/format";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import SourceStatusPill from "$lib/components/SourceStatusPill.svelte";
  import type { OverviewDto } from "@vd/shared";

  let overview = $state<OverviewDto | null>(null);
  let error = $state<string | null>(null);

  onMount(() => {
    void api
      .overview()
      .then((o) => (overview = o))
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  async function scanOne(id: number) {
    try {
      await api.scan(id);
      overview = await api.overview();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<svelte:head><title>Sources · vipdedup</title></svelte:head>

<PageHead title="Sources" sub="Each mounted location, browseable file by file" />

{#if error}
  <p class="err">{error}</p>
{/if}

{#if overview === null}
  <SkeletonPanel height={160} />
{:else if overview.sources.length === 0}
  <Panel><EmptyState>No sources configured.</EmptyState></Panel>
{:else}
  <Panel title="Locations" count={overview.sources.length}>
    <div class="panel-body tight">
      <table class="sheet">
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th class="r">Files</th>
            <th class="r">Size</th>
            <th>Last scan</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each overview.sources as s (s.source.id)}
            <tr>
              <td>
                <a class="rowlink-name" href="/sources/{s.source.id}">{s.source.label}</a>
                <div class="subtle">{s.source.path}</div>
              </td>
              <td><SourceStatusPill status={s} /></td>
              <td class="r">{s.fileCount.toLocaleString()}</td>
              <td class="r">{formatBytes(s.bytes)}</td>
              <td class="subtle">{s.lastScan ? relTime(s.lastScan.finishedAt ?? s.lastScan.startedAt) : "never"}</td>
              <td class="r">
                <Button small onclick={() => scanOne(s.source.id)} disabled={s.scanning}>
                  {s.scanning ? "Scanning…" : "Scan"}
                </Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Panel>
{/if}
