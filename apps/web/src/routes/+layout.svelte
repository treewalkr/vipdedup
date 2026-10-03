<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";

  let { children } = $props();

  const groups = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Overview", icon: "grid" },
        { href: "/duplicates", label: "Duplicates", icon: "copy" },
      ],
    },
    {
      label: "Locations",
      items: [
        { href: "/sources", label: "Sources", icon: "drive" },
        { href: "/trash", label: "Trash", icon: "trash" },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href);
</script>

<div class="shell">
  <aside class="side">
    <a class="brand" href="/">
      <span class="mark" aria-hidden="true">VD</span>
      <span class="name">
        vipdedup
        <small>N-source dedup manager</small>
      </span>
    </a>

    <nav aria-label="Primary">
      {#each groups as group (group.label)}
        <div class="nav-label">{group.label}</div>
        {#each group.items as item (item.href)}
          <a
            class="nav-item"
            class:active={isActive(item.href)}
            aria-current={isActive(item.href) ? "page" : undefined}
            href={item.href}
            title={item.label}
          >
            {#if item.icon === "grid"}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></svg>
            {:else if item.icon === "copy"}
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {:else if item.icon === "drive"}
              <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" y1="16" x2="6.01" y2="16" /><line x1="10" y1="16" x2="10.01" y2="16" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
            {/if}
            <span class="nav-text">{item.label}</span>
          </a>
        {/each}
      {/each}
    </nav>

    <div class="side-foot">
      <span class="dot" aria-hidden="true"></span>local · staged trash
    </div>
  </aside>

  <main class="main">
    {@render children()}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 236px 1fr;
    min-height: 100vh;
  }

  .side {
    background: var(--well);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 12px 16px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    text-decoration: none;
  }
  .mark {
    width: 26px;
    height: 26px;
    border-radius: 99px;
    background: #24292f;
    color: #fff;
    display: grid;
    place-items: center;
    font: 600 11px/1 var(--font-ui);
    flex: none;
  }
  .name {
    font: 600 14px/1.2 var(--font-ui);
    color: var(--ink);
  }
  .name small {
    display: block;
    font: 400 11px/1.7 var(--font-ui);
    color: var(--muted);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
  }
  .nav-label {
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 8px;
    margin: 4px 0 7px;
    white-space: nowrap;
  }
  .nav-item + .nav-label {
    margin-top: 12px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    border-radius: 6px;
    text-decoration: none;
    font: 400 14px/1.4 var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
  }
  .nav-item svg {
    width: 16px;
    height: 16px;
    stroke: #59636e;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .nav-item:hover {
    background: var(--well-2);
    text-decoration: none;
  }
  .nav-item.active {
    background: var(--active);
    font-weight: 600;
  }
  .nav-item.active svg {
    stroke: var(--ink);
  }

  .side-foot {
    margin-top: auto;
    border-top: 1px solid var(--line);
    padding: 14px 8px 0;
    font: 400 12px/1.6 var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
  }
  .side-foot .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 99px;
    background: var(--green-btn);
    margin-right: 6px;
  }

  .main {
    padding: 28px 32px 64px;
    max-width: 1080px;
    width: 100%;
    margin: 0 auto;
    min-width: 0; /* grid child: let content shrink instead of forcing min-content width */
  }

  @media (max-width: 860px) {
    .shell {
      grid-template-columns: 56px 1fr;
    }
    .side {
      padding: 16px 8px;
      gap: 14px;
    }
    .brand {
      padding: 0;
      justify-content: center;
    }
    .name {
      display: none;
    }
    .nav-label {
      visibility: hidden;
      height: 8px;
      margin: 0;
      padding: 0;
    }
    .nav-text,
    .side-foot {
      display: none;
    }
    .nav-item {
      justify-content: center;
      padding: 8px 0;
    }
    .main {
      padding: 20px 16px 56px;
    }
  }
</style>
