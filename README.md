# vipdedup

Web app for visualizing **N source locations** (external drives) and the overlaps between
them — duplicated collections, byte-identical files under renamed folders, differing copies
of the same name — and for cleaning them up safely.

Stack and UI copied from `../program-tracker`: Bun workspace monorepo, Elysia API +
SvelteKit (Svelte 5 runes) SPA with an Eden Treaty client and the hand-rolled GitHub
Primer design system. Differences: **SQLite** (`bun:sqlite` + Drizzle) instead of
Postgres/Docker, no Storybook, no mock mode.

## Run

```sh
bun install
bun run dev
# API  → http://localhost:4100  (openapi docs at /openapi)
# Web  → http://localhost:5174
```

The three source folders are seeded from `apps/api/src/config.ts` on first boot.
The SQLite DB lives at `vipdedup.db` (repo root) — override with `VIPDEDUP_DB`.

## How it works

1. **Scan** — each source is walked by a *subprocess* with a watchdog timeout
   (`SCAN_TIMEOUT_MS`, default 20 min). Mounty/NTFS mounts can wedge at the FUSE layer
   where fs calls block forever; a wedged scan is killed and reported as `timeout` —
   unmount + remount the drive, then scan again. Scans ignore `.DS_Store`, `._*`,
   `fuse_hidden*`, `Thumbs.db`, etc. and are snapshot-based (rescan replaces the
   source's rows).
2. **Match** — folder groups (same top-level folder name across sources), file groups
   (same relative path), and hash groups (byte-identical under a different path, caught
   via same name+size). Only duplicate *candidates* get SHA-256 hashed — full-content
   verification where it matters without reading every byte of every drive.
3. **Manage** — "Keep this source" stages the other copies into
   `<drive>/.vipdedup-trash/<runId>/…` (same-volume rename: instant, works on full
   drives). The Trash page restores or purges. **Nothing is permanently deleted until
   you purge.**

## Safety properties

- **Every filesystem-mutating operation (scan, trash move, restore, purge) runs in its
  own watchdogged subprocess** (`SCAN_TIMEOUT_MS` / `TRASH_TIMEOUT_MS`, default 20/10
  min). A wedged FUSE mount can freeze and even make a worker process unkillable
  (`SIGKILL` can't land while a thread sits in an uninterruptible syscall) — the API
  server itself stays responsive, reports the timeout, and you recover by force
  unmounting the drive (`diskutil unmount force <mount>`) and remounting it via Mounty.
  This is not hypothetical: a synchronous `rmdir` on a wedged mount froze the API once.
- Destructive actions are two-step (arm + confirm) and always stage first.
- Folder-level "keep" only trashes copies whose content is verified equal (hash when
  both hashed, else size) to the kept source's copy.
- Reveal-in-Finder paths are validated against the source root.
- The SQLite DB lives at `apps/vipdedup.db` (override with `VIPDEDUP_DB`).

## Tests

```sh
bun test          # shared path helpers + api matching unit tests + api e2e (temp fixtures)
bun run check     # svelte-check on the web app
```
