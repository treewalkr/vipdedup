<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { formatBytes, relTime } from "$lib/format";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import SourceStatusPill from "$lib/components/SourceStatusPill.svelte";
  import type { OverviewDto } from "@vd/shared";

  let overview = $state<OverviewDto | null>(null);
  let note = $state<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);
  let label = $state("");
  let path = $state("");
  let adding = $state(false);
  let removingId = $state<number | null>(null);

  async function load() {
    overview = await api.overview();
  }

  onMount(() => {
    void load().catch((e) => (note = { tone: "bad", text: e instanceof Error ? e.message : String(e) }));
  });

  const canAdd = $derived(label.trim() !== "" && path.trim().startsWith("/"));

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!canAdd || adding) return;
    adding = true;
    try {
      await api.addSource(label.trim(), path.trim());
      label = "";
      path = "";
      note = { tone: "ok", text: "Added — run a scan when ready" };
      await load();
    } catch (err) {
      note = { tone: "bad", text: err instanceof Error ? err.message : String(err) };
    } finally {
      adding = false;
    }
  }

  async function scanOne(id: number) {
    try {
      await api.scan(id);
      overview = await api.overview();
    } catch (e) {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    }
  }

  async function removeOne(id: number) {
    removingId = id;
    try {
      await api.removeSource(id);
      note = { tone: "ok", text: "Removed — vipdedup's metadata only, nothing on disk was deleted" };
      await load();
    } catch (e) {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    } finally {
      removingId = null;
    }
  }
</script>

<svelte:head><title>Sources · vipdedup</title></svelte:head>

<PageHead title="Sources" sub="Each mounted location, browseable file by file" />

{#if note}
  <Note tone={note.tone} role="status" class="flash">{note.text}</Note>
{/if}

{#if overview === null}
  <SkeletonPanel height={160} />
{:else}
  <Panel title="Add location" class="mb">
    <form class="panel-body add-form" onsubmit={add}>
      <div class="field">
        <label class="label" for="add-label">Label</label>
        <input id="add-label" class="input" bind:value={label} placeholder="e.g. WD My Passport" />
      </div>
      <div class="field grow">
        <label class="label" for="add-path">Path</label>
        <input id="add-path" class="input mono" bind:value={path} placeholder="/Volumes/DriveName" />
      </div>
      <Button variant="primary" type="submit" disabled={!canAdd || adding}>
        {adding ? "Adding…" : "Add"}
      </Button>
    </form>
  </Panel>

  {#if overview.sources.length === 0}
    <Panel>
      <EmptyState>No sources yet — add your first location above.</EmptyState>
    </Panel>
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
                <td class="r actions">
                  <Button small onclick={() => scanOne(s.source.id)} disabled={s.scanning}>
                    {s.scanning ? "Scanning…" : "Scan"}
                  </Button>
                  <ConfirmButton
                    small
                    label="Remove"
                    confirmLabel="Nothing on disk is deleted — remove?"
                    onconfirm={() => removeOne(s.source.id)}
                    disabled={s.scanning || removingId !== null}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>
  {/if}
{/if}

<style>
  .add-form {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }
  .field {
    flex: 1;
  }
  .field.grow {
    flex: 2;
  }
  .actions {
    white-space: nowrap;
  }
  .actions :global(.btn) {
    margin-left: 6px;
  }
</style>
