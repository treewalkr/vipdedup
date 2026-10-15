# vipdedup

Web app for visualizing N source locations (external drives) and the overlaps between
them — duplicated collections, byte-identical files under renamed folders, differing
copies of the same name — and for cleaning them up safely.

Nothing is permanently deleted until you purge: removed files are first staged into
`<drive>/.vipdedup-trash/` (same-volume rename) and can be restored from the Trash page.

## Run

```sh
bun install
bun run dev
# API  → http://localhost:4100  (openapi docs at /openapi)
# Web  → http://localhost:5174
```

## Tests

```sh
bun test
bun run check
```
