<script lang="ts">
  import type { GroupStatus } from "@vd/shared";
  import Pill from "$lib/ui/Pill.svelte";

  const MAP: Record<GroupStatus, { tone: "good" | "warn" | "bad" | "neutral"; label: string }> = {
    identical: { tone: "good", label: "verified identical" },
    partial: { tone: "warn", label: "partially verified" },
    unverified: { tone: "neutral", label: "unverified" },
    differ: { tone: "bad", label: "content differs" },
  };

  let { status }: { status: GroupStatus } = $props();
  const view = $derived(MAP[status]);
</script>

<Pill tone={view.tone}>{view.label}</Pill>
