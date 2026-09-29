import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { z } from "zod";
import { overviewRoutes } from "./routes/overview";
import { sourceRoutes } from "./routes/sources";
import { scanRoutes } from "./routes/scan";
import { groupRoutes } from "./routes/groups";
import { trashRoutes } from "./routes/trash";
import { miscRoutes } from "./routes/misc";

const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5174")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const TAGS = [
  { name: "health", description: "Liveness" },
  { name: "overview", description: "Dashboard aggregate" },
  { name: "sources", description: "Source locations, scans and browsing" },
  { name: "groups", description: "Duplicate groups and staged-trash actions" },
  { name: "trash", description: "Staged deletions: restore / purge" },
  { name: "misc", description: "Desktop integration" },
];

export const app = new Elysia()
  .use(cors({ origin: corsOrigins }))
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: {
          title: "vipdedup API",
          version: "0.1.0",
          description:
            "N-source duplicate visualizer. Scans are snapshot-based; all deletions are staged same-volume moves into .vipdedup-trash/ until purged.",
        },
        tags: TAGS,
      },
      mapJsonSchema: { zod: z.toJSONSchema },
    }),
  )
  .get(
    "/health",
    () => ({ ok: true, service: "vipdedup-api", time: new Date().toISOString() }),
    { detail: { summary: "Liveness probe", tags: ["health"] } },
  )
  .use(overviewRoutes)
  .use(sourceRoutes)
  .use(scanRoutes)
  .use(groupRoutes)
  .use(trashRoutes)
  .use(miscRoutes);

export type App = typeof app;
