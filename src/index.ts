import { pool } from "./db/index.js";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { PORT } from "./config.js";

const server = serve({ fetch: app.fetch, port: PORT });
console.log(`Backend running on port ${PORT}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await pool.end(); clearTimeout(deadline); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
