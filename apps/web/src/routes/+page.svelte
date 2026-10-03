<script lang="ts">
  import { onMount } from "svelte";
  import type { OverviewDto, SourceStatusDto } from "@vd/shared";
  import { api } from "$lib/api";
  import { formatBytes, relTime } from "$lib/format";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import SourceStatusPill from "$lib/components/SourceStatusPill.svelte";

  let overview = $state<OverviewDto | null>(null);
  let error = $state<string | null>(null);
  let scanningNow = $state(false);

  const anyScanning = $derived(overview?.sources.some((s) => s.scanning) ?? false);

  async function load() {
    try {
      overview = await api.overview();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function scanAll() {
    scanningNow = true;
    try {
      await api.scanAll();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      scanningNow = false;
    }
  }

  async function scanOne(id: number) {
    try {
      await api.scan(id);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => {
      if (anyScanning) void load();
    }, 2500);
    return () => clearInterval(timer);
  });

  const offline = $derived(overview?.sources.filter((s) => !s.online) ?? []);

  function scanCell(s: SourceStatusDto) {
    if (s.scanning) {
      return `scanning (${s.lastScan?.phase ?? "scan"})… ${s.lastScan?.fileCount ?? 0} files`;
    }
    if (!s.lastScan) return "never scanned";
    return relTime(s.lastScan.finishedAt ?? s.lastScan.startedAt);
  }
</script>

<svelte:head><title>Overview · vipdedup</title></svelte:head>

<PageHead
  title="Overview"
  sub={overview
    ? `${overview.sources.length} sources · ${overview.overlap.folderGroups} duplicated collections · ~${formatBytes(overview.overlap.reclaimableBytes)} reclaimable`
    : "N-source duplicate manager"}
>
  {#snippet actions()}
    <Button variant="primary" onclick={scanAll} disabled={scanningNow || anyScanning}>
      {anyScanning ? "Scanning…" : "Scan all"}
    </Button>
  {/snippet}
</PageHead>

{#if error}
  <Note tone="bad" role="alert" class="flash">{error}</Note>
{/if}

{#if offline.length > 0}
  <Note tone="warn" role="note" class="flash">
    {offline.map((s) => s.source.label).join(", ")} {offline.length === 1 ? "is" : "are"} not
    reachable right now — mount the drive and rescan. A mount that hangs the scan shows as
    <strong>timeout</strong>: unmount + remount it (e.g. via Mounty), then scan again.
  </Note>
{/if}

{#if overview === null && error === null}
  <SkeletonPanel height={220} />
{:else if overview}
  <Panel title="Sources" count={overview.sources.length} class="mb">
    {#if overview.sources.length === 0}
      <EmptyState>No sources configured.</EmptyState>
    {:else}
      <div class="panel-body tight">
        <table class="sheet">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Last scan</th>
              <th class="r">Files</th>
              <th class="r">Size</th>
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
                <td class="subtle" title={s.lastScan?.error ?? undefined}>{scanCell(s)}</td>
                <td class="r">{s.fileCount.toLocaleString()}</td>
                <td class="r">{formatBytes(s.bytes)}</td>
                <td class="r">
                  <Button
                    small
                    onclick={() => scanOne(s.source.id)}
                    disabled={s.scanning}
                  >
                    {s.scanning ? "Scanning…" : "Scan"}
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Panel>

  <Panel title="Overlap" class="mb">
    <div class="panel-body tiles">
      <div class="tile">
        <div class="num big">{overview.overlap.folderGroups}</div>
        <div class="sub">duplicated collections</div>
      </div>
      <div class="tile">
        <div class="num big">{overview.overlap.fileGroups}</div>
        <div class="sub">duplicate file groups</div>
      </div>
      <div class="tile">
        <div class="num big">{overview.overlap.confirmedGroups}</div>
        <div class="sub">hash-verified identical</div>
      </div>
      <div class="tile">
        <div class="num big">{formatBytes(overview.overlap.reclaimableBytes)}</div>
        <div class="sub">reclaimable (best case)</div>
      </div>
    </div>
    {#if overview.sources.length >= 2}
      <div class="panel-body tight">
        <table class="sheet matrix">
          <thead>
            <tr>
              <th></th>
              {#each overview.sources as s (s.source.id)}<th>{s.source.label}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each overview.sources as row (row.source.id)}
              <tr>
                <th scope="row">{row.source.label}</th>
                {#each overview.sources as col (col.source.id)}
                  <td class="r">
                    {#if col.source.id === row.source.id}
                      <span class="subtle">—</span>
                    {:else if col.source.id > row.source.id}
                      {@const cell = overview.overlap.matrix.find(
                        (m) =>
                          (m.aId === row.source.id && m.bId === col.source.id) ||
                          (m.aId === col.source.id && m.bId === row.source.id),
                      )}
                      {#if cell && (cell.sharedFolders > 0 || cell.sharedFiles > 0)}
                        <span class="num">{cell.sharedFolders} folders</span>
                        <div class="subtle">{formatBytes(cell.sharedBytes)}</div>
                      {:else}
                        <span class="subtle">clean</span>
                      {/if}
                    {:else}
                      <span class="subtle"></span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Panel>
{/if}

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 18px;
  }
  .tile .sub {
    margin-top: 2px;
  }
  .matrix th[scope="row"] {
    border-bottom: 1px solid var(--line-soft);
    padding: 9px 10px;
  }
</style>
