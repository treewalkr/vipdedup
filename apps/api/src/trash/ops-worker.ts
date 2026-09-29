/**
 * Trash ops worker — always launched as a subprocess by manager.ts.
 * Performs the actual fs mutations (rename/rmdir/rm) off the API's event
 * loop; a wedged FUSE mount blocks this process, never the server.
 *
 * usage: bun ops-worker.ts '<json-op>'
 * prints one JSON line: { ok: true, ...result } or { ok: false, code, error }
 */
import { moveFilesToTrash, purgeAllItems, purgeItem, restoreItem, type TrashOp } from "./ops";

function run(op: TrashOp): Record<string, unknown> {
  switch (op.op) {
    case "move": {
      const r = moveFilesToTrash(op.sourceId, op.rows);
      return { moved: r.movedIds.length, bytes: r.bytes, failures: r.failures };
    }
    case "restore": {
      const r = restoreItem(op.itemId);
      return r.ok ? { relPath: r.relPath } : { code: r.code, error: r.error, fail: true };
    }
    case "purge": {
      const r = purgeItem(op.itemId);
      return r.ok ? {} : { code: r.code, error: r.error, fail: true };
    }
    case "purge-all":
      return purgeAllItems();
  }
}

const raw = process.argv[2];
if (!raw) {
  console.error("usage: bun ops-worker.ts '<json-op>'");
  process.exit(2);
}

try {
  const op = JSON.parse(raw) as TrashOp;
  const result = run(op);
  const failed = result.fail === true;
  delete result.fail;
  console.log(JSON.stringify(failed ? { ok: false, ...result } : { ok: true, ...result }));
  process.exit(failed ? 3 : 0);
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: "io", error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
}
