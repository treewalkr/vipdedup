<script lang="ts">
  import { onMount } from "svelte";
  import type { TrashItemDto } from "@vd/shared";
  import { api } from "$lib/api";
  import { formatBytes, relTime } from "$lib/format";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";

  let items = $state<TrashItemDto[] | null>(null);
  let note = $state<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);
  let busy = $state(false);

  async function load() {
    items = await api.trash();
  }

  onMount(() => {
    void load().catch((e) => (note = { tone: "bad", text: e instanceof Error ? e.message : String(e) }));
  });

  async function restore(id: number) {
    try {
      const res = await api.restore(id);
      note = { tone: "ok", text: `Restored ${res.relPath}` };
      await load();
    } catch (e) {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    }
  }

  async function purge(id: number) {
    try {
      await api.purge(id);
      await load();
    } catch (e) {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    }
  }

  async function purgeAll() {
    busy = true;
    try {
      const res = await api.purgeAll();
      note = {
        tone: res.failures.length > 0 ? "warn" : "ok",
        text: `Permanently deleted ${res.purged} file(s)${res.failures.length > 0 ? ` — ${res.failures.length} failed` : ""}`,
      };
      await load();
    } catch (e) {
      note = { tone: "bad", text: e instanceof Error ? e.message : String(e) };
    } finally {
      busy = false;
    }
  }

  const bySource = $derived.by(() => {
    const map = new Map<string, TrashItemDto[]>();
    for (const item of items ?? []) {
      const list = map.get(item.sourceLabel) ?? [];
      list.push(item);
      map.set(item.sourceLabel, list);
    }
    return [...map.entries()];
  });

  const totalBytes = $derived((items ?? []).reduce((acc, i) => acc + i.size, 0));
</script>

<svelte:head><title>Trash · vipdedup</title></svelte:head>

<PageHead
  title="Trash"
  sub={items === null ? "Staged deletions — reversible until purged" : `${items.length} staged file(s) · ${formatBytes(totalBytes)} reclaimable on purge`}
>
  {#snippet actions()}
    {#if items !== null && items.length > 0}
      <ConfirmButton
        label="Purge all"
        confirmLabel="Permanently delete everything?"
        onconfirm={purgeAll}
        disabled={busy}
      />
    {/if}
  {/snippet}
</PageHead>

{#if note}
  <Note tone={note.tone} role="status" class="flash">{note.text}</Note>
{/if}

{#if items === null}
  <SkeletonPanel height={120} />
{:else if items.length === 0}
  <Panel>
    <EmptyState>
      Trash is empty. Files you dedupe from the Duplicates page land here first — restore or purge them from this page.
    </EmptyState>
  </Panel>
{:else}
  {#each bySource as [label, list] (label)}
    <Panel title={label} count={list.length} class="mb">
      <div class="panel-body tight">
        <table class="sheet">
          <thead>
            <tr>
              <th>Original path</th>
              <th class="r">Size</th>
              <th>Trashed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each list as item (item.id)}
              <tr>
                <td class="mono">{item.originalRelPath}</td>
                <td class="r">{formatBytes(item.size)}</td>
                <td class="subtle">{relTime(item.trashedAt)}</td>
                <td class="r actions">
                  <Button small onclick={() => restore(item.id)}>Restore</Button>
                  <ConfirmButton small label="Purge" onconfirm={() => purge(item.id)} />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>
  {/each}
{/if}

<style>
  .actions {
    white-space: nowrap;
  }
  .actions :global(.btn) {
    margin-left: 6px;
  }
</style>
