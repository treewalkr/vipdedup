<script lang="ts">
  import { onMount } from "svelte";
  import type { AnyGroupDto, FolderGroupDto, FileGroupDto } from "@vd/shared";
  import { api } from "$lib/api";
  import { formatBytes, relTime } from "$lib/format";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Note from "$lib/ui/Note.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import GroupStatusPill from "$lib/components/GroupStatusPill.svelte";

  let sources = $state<{ id: number; label: string }[]>([]);
  let tab = $state<"folder" | "file">("folder");
  let folderGroups = $state<AnyGroupDto[] | null>(null);
  let fileGroups = $state<AnyGroupDto[] | null>(null);
  let selected = $state<Set<number>>(new Set());
  let verifiedOnly = $state(false);
  let expanded = $state<Set<string>>(new Set());
  let note = $state<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);
  let busyKey = $state<string | null>(null);

  async function load() {
    const [folders, files, overview] = await Promise.all([
      api.groups({ type: "folder" }),
      api.groups({ type: "file" }),
      api.overview(),
    ]);
    folderGroups = folders.groups;
    fileGroups = files.groups;
    sources = overview.sources.map((s) => ({ id: s.source.id, label: s.source.label }));
  }

  onMount(() => {
    void load().catch((e) => (note = { tone: "bad", text: e instanceof Error ? e.message : String(e) }));
  });

  async function reload() {
    await load();
  }

  const active = $derived(tab === "folder" ? folderGroups : fileGroups);
  const filtered = $derived(
    (active ?? []).filter((g) => {
      if (verifiedOnly && g.status !== "identical") return false;
      if (selected.size > 0 && !g.sources.some((s) => selected.has(s.sourceId))) return false;
      return true;
    }),
  );

  function toggleExpanded(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }

  function toggleSource(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  async function keepOne(key: string, sourceId: number, label: string) {
    busyKey = key;
    try {
      const res = await api.trashGroup(key, sourceId);
      const suffix = res.failures.length > 0 ? ` — ${res.failures.length} file(s) failed to move` : "";
      note = {
        tone: res.failures.length > 0 ? "warn" : "ok",
        text: `Kept ${label}: staged ${res.trashed} duplicate file(s), ${formatBytes(res.bytes)} reclaimable${suffix}. Undo in Trash.`,
      };
      await reload();
    } catch (e) {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    } finally {
      busyKey = null;
    }
  }

  function reveal(sourceId: number, relPath: string | null) {
    if (!relPath) return;
    void api.reveal(sourceId, relPath).catch((e) => {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    });
  }

  const loading = $derived(folderGroups === null || fileGroups === null);
</script>

<svelte:head><title>Duplicates · vipdedup</title></svelte:head>

<PageHead
  title="Duplicates"
  sub={loading ? "Overlapping files and collections across sources" : `${(folderGroups ?? []).length} collections · ${(fileGroups ?? []).length} file groups`}
/>

{#if note}
  <Note tone={note.tone} role="status" class="flash">{note.text}</Note>
{/if}

{#if loading}
  <SkeletonPanel height={260} />
{:else}
  <Tabs
    label="Duplicate type"
    items={[
      { id: "folder", label: "Folder-level", count: `${(folderGroups ?? []).length}` },
      { id: "file", label: "File-level", count: `${(fileGroups ?? []).length}` },
    ]}
    value={tab}
    onchange={(id) => (tab = id as "folder" | "file")}
  />

  <div class="filters">
    {#each sources as s (s.id)}
      <ToggleChip on={selected.has(s.id)} onclick={() => toggleSource(s.id)}>{s.label}</ToggleChip>
    {/each}
    <ToggleChip on={verifiedOnly} onclick={() => (verifiedOnly = !verifiedOnly)}>
      verified identical only
    </ToggleChip>
  </div>

  <Panel>
    {#if filtered.length === 0}
      <EmptyState>
        No duplicate groups match the current filters — either the sources are clean or not scanned yet.
      </EmptyState>
    {:else}
      <div class="panel-body tight">
        <table class="sheet">
          <thead>
            <tr>
              <th>{tab === "folder" ? "Collection" : "File"}</th>
              <th>Sources</th>
              {#if tab === "folder"}<th class="r">Dup files</th>{/if}
              <th class="r">Reclaimable</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as g (g.key)}
              {@const open = expanded.has(g.key)}
              <tr class="group-row" onclick={() => toggleExpanded(g.key)}>
                <td>
                  <button class="rowtoggle" onclick={() => toggleExpanded(g.key)}>
                    {g.name}
                    {#if g.kind === "file"}
                      {#if g.relPath && g.relPath.includes("/")}
                        <div class="subtle">{g.relPath}</div>
                      {:else if g.matchBasis === "hash"}
                        <div class="subtle">byte-identical, different paths</div>
                      {/if}
                    {/if}
                  </button>
                </td>
                <td>
                  <span class="src-pills">
                    {#each g.sources as s (s.sourceId)}
                      <span class="pill neutral" title={`${s.fileCount} file(s), ${formatBytes(s.bytes)}`}>
                        {s.label}
                        {#if g.kind === "folder"}<span class="n">×{s.fileCount}</span>{/if}
                      </span>
                    {/each}
                  </span>
                </td>
                {#if g.kind === "folder"}<td class="r">{g.dupFileCount}</td>{/if}
                <td class="r">{formatBytes(g.dupBytes)}</td>
                <td><GroupStatusPill status={g.status} /></td>
                <td class="r chev" aria-hidden="true">{open ? "▾" : "▸"}</td>
              </tr>
              {#if open}
                <tr class="detail">
                  <td colspan={tab === "folder" ? 6 : 5}>
                    <table class="sheet inner">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Location</th>
                          <th class="r">Files</th>
                          <th class="r">Size</th>
                          <th class="r">Matched</th>
                          <th class="r">Hashed</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each g.sources as s (s.sourceId)}
                          <tr>
                            <td>{s.label}</td>
                            <td class="subtle mono">{s.exampleRelPath ?? "—"}</td>
                            <td class="r">{s.fileCount}</td>
                            <td class="r">{formatBytes(s.bytes)}</td>
                            <td class="r">{g.kind === "folder" ? s.matchedCount : "—"}</td>
                            <td class="r">{s.hashedCount}</td>
                            <td class="r actions">
                              <Button small variant="ghost" onclick={() => reveal(s.sourceId, s.exampleRelPath)}>
                                Reveal
                              </Button>
                              {#if g.status === "identical" || g.status === "partial"}
                                <ConfirmButton
                                  small
                                  label="Keep this"
                                  confirmLabel={`Keep ${s.label}?`}
                                  onconfirm={() => keepOne(g.key, s.sourceId, s.label)}
                                  disabled={busyKey === g.key || g.sources.length < 2}
                                />
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                    {#if g.status === "differ"}
                      <p class="subtle hint">
                        Copies with the same name have different content — nothing will be trashed automatically.
                      </p>
                    {:else if g.status === "unverified"}
                      <p class="subtle hint">
                        Not hash-verified (source offline during last scan). Rescan to verify before trashing.
                      </p>
                    {/if}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Panel>
{/if}

<style>
  .rowtoggle {
    appearance: none;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: 600 14px/1.4 var(--font-ui);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .rowtoggle:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .rowtoggle:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .group-row {
    cursor: pointer;
  }
  .src-pills {
    display: inline-flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .src-pills .n {
    margin-left: 3px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
  }
  .chev {
    color: var(--muted);
    width: 24px;
  }
  tr.detail > td {
    background: var(--well);
    padding: 10px 16px 14px;
  }
  .inner {
    background: var(--surface);
    border: 1px solid var(--line-soft);
    border-radius: 6px;
  }
  .inner th {
    border-bottom: 1px solid var(--line-soft);
  }
  .actions {
    white-space: nowrap;
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .hint {
    margin: 8px 2px 0;
  }
</style>
