/**
 * Scan worker entrypoint — always launched as a subprocess by manager.ts
 * (never imported by the API server) so a hung FUSE mount can be killed.
 *
 * usage: bun worker.ts <sourceId>
 */
import { runScan } from "./scan";

const sourceId = Number(process.argv[2]);
if (!Number.isFinite(sourceId) || sourceId <= 0) {
  console.error("usage: bun worker.ts <sourceId>");
  process.exit(2);
}

const outcome = await runScan(sourceId);
console.log(JSON.stringify(outcome));
process.exit(outcome.status === "ok" ? 0 : 3);
