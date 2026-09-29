import { app } from "./app";
import { cleanupStaleRuns } from "./scanner/manager";

cleanupStaleRuns();

const port = Number(process.env.API_PORT ?? 4100);
app.listen(port);
console.log(`vipdedup API listening on :${port}`);
