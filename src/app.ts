import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { petAccess } from "./middleware/pet-access.js";
import { requireAdmin, forbidden } from "./middleware/auth.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { CORS_ORIGINS } from "./config.js";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { users } from "./db/schema.js";
import type { AppEnv } from "./middleware/auth.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { adRoutes } from "./routes/ad.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { billingRoutes } from "./routes/billing.routes.js";
import { careRoutes } from "./routes/care.routes.js";
import { expenseRoutes } from "./routes/expense.routes.js";
import { healthRecordRoutes } from "./routes/health-record.routes.js";
import { petRoutes } from "./routes/pet.routes.js";
import { reminderRoutes } from "./routes/reminder.routes.js";
import { userRoutes } from "./routes/user.routes.js";

export const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: CORS_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use('*', secureHeaders());
app.use('/api/*', bodyLimit({ maxSize: 3 * 1024 * 1024, onError: c => c.json({ error: 'ข้อมูลมีขนาดใหญ่เกินไป' }, 413) }));
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (['POST', 'PATCH', 'PUT'].includes(c.req.method) && c.req.header('Content-Type')?.includes('application/json')) {
    try {
      const raw = await c.req.text();
      if (!raw.trim()) { await next(); return; }
      const body = await c.req.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400);
    } catch { return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400); }
  }
  await next();
});
app.use('/api/*', petAccess);
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  if (error instanceof SyntaxError) return c.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400);
  console.error(error);
  return c.json({ error: "เกิดข้อผิดพลาดในระบบ" }, 500);
});

app.get("/", (c) => c.json({ message: "HoangHoangMeow backend is running" }));
app.get("/api/health", (c) => c.json({ status: "ok" }));
app.get('/api/ready', async c => {
  try { await db.execute(sql`SELECT 1`); return c.json({ status: 'ready' }); }
  catch { return c.json({ status: 'unavailable' }, 503); }
});
app.get("/api/db-check", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  try {
    const result = await db.select({ id: users.id }).from(users);
    return c.json({ connected: true, rowCount: result.length });
  } catch (error) {
    return c.json({ connected: false }, 503);
  }
});

app.route("/", authRoutes);
app.route("/", userRoutes);
app.route("/", petRoutes);
app.route("/", healthRecordRoutes);
app.route("/", reminderRoutes);
app.route("/", expenseRoutes);
app.route("/", careRoutes);
app.route("/", adRoutes);
app.route("/", billingRoutes);
app.route("/", adminRoutes);

