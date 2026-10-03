<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api, type BrowseResult } from "$lib/api";
  import { formatBytes, relTime } from "$lib/format";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";

  let data = $state<BrowseResult | null>(null);
  let label = $state<string>("");
  let error = $state<string | null>(null);

  const sourceId = $derived(Number(page.params.id));
  const dir = $derived(page.url.searchParams.get("dir") ?? "");

  async function load() {
    if (!Number.isFinite(sourceId)) return;
    try {
      const [browse, overview] = await Promise.all([
        api.browse(sourceId, dir),
        api.overview(),
      ]);
      data = browse;
      label = overview.sources.find((s) => s.source.id === sourceId)?.source.label ?? `Source ${sourceId}`;
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  // reload whenever the ?dir= query changes (client-side nav)
  $effect(() => {
    void dir;
    void sourceId;
    void load();
  });

  function navigate(nextDir: string) {
    void goto(nextDir === "" ? `/sources/${sourceId}` : `/sources/${sourceId}?dir=${encodeURIComponent(nextDir)}`);
  }

  function reveal(relPath: string) {
    void api.reveal(sourceId, relPath).catch((e) => {
      error = e instanceof Error ? e.message : String(e);
    });
  }

  const crumbs = $derived.by(() => {
    const items: { href?: string; label: string }[] = [{ href: "/sources", label: "Sources" }];
    if (dir === "") {
      items.push({ label });
    } else {
      items.push({ href: `/sources/${sourceId}`, label });
      const segs = dir.split("/");
      segs.forEach((seg, i) => {
        if (i === segs.length - 1) items.push({ label: seg });
        else
          items.push({
            href: `/sources/${sourceId}?dir=${encodeURIComponent(segs.slice(0, i + 1).join("/"))}`,
            label: seg,
          });
      });
    }
    return items;
  });
</script>

<svelte:head><title>{label} · vipdedup</title></svelte:head>

<PageHead title={label || "Source"} {crumbs} sub={dir === "" ? "Top level" : dir} />

{#if error}
  <Note tone="bad" role="alert" class="flash">{error}</Note>
{/if}

{#if data === null}
  <SkeletonPanel height={180} />
{:else}
  {#if data.folders.length > 0}
    <Panel title="Folders" count={data.folders.length} class="mb">
      <div class="panel-body tight">
        <table class="sheet">
          <thead>
            <tr>
              <th>Name</th>
              <th class="r">Files</th>
              <th class="r">Size</th>
              <th>Also in</th>
            </tr>
          </thead>
          <tbody>
            {#each data.folders as f (f.relPath)}
              <tr>
                <td>
                  <a class="rowlink-name" href="/sources/{sourceId}?dir={encodeURIComponent(f.relPath)}" onclick={(e) => { e.preventDefault(); navigate(f.relPath); }}>
                    {f.name}
                  </a>
                </td>
                <td class="r">{f.fileCount.toLocaleString()}</td>
                <td class="r">{formatBytes(f.bytes)}</td>
                <td>
                  {#each f.dupInLabels as l (l)}
                    <Pill tone="warn">{l}</Pill>
                  {:else}
                    <span class="subtle">unique</span>
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>
  {/if}

  <Panel title="Files" count={data.files.length}>
    {#if data.files.length === 0}
      <EmptyState>No files directly in this folder.</EmptyState>
    {:else}
      <div class="panel-body tight">
        <table class="sheet">
          <thead>
            <tr>
              <th>Name</th>
              <th class="r">Size</th>
              <th>Modified</th>
              <th>Duplicates</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each data.files as f (f.id)}
              <tr>
                <td class="mono">{f.name}</td>
                <td class="r">{formatBytes(f.size)}</td>
                <td class="subtle">{relTime(f.mtime)}</td>
                <td>
                  {#if f.dupCopies > 0}
                    <span class="pill warn" title={f.dupInLabels.join(", ")}>×{f.dupCopies + 1} in {f.dupInLabels.join(", ")}</span>
                  {:else}
                    <span class="subtle">unique</span>
                  {/if}
                </td>
                <td class="r">
                  <Button small variant="ghost" onclick={() => reveal(f.relPath)}>Reveal</Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Panel>
{/if}
