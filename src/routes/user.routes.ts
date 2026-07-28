// Current-user routes: profile read/update, change password, delete account.

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import {
  hashPassword,
  passwordMatches,
  publicUser,
} from "../utils/auth.js";
import { asText } from "../utils/helpers.js";

export const userRoutes = new Hono<AppEnv>();

userRoutes.get("/api/me", async (c) => {
  const user = await requireUser(c);
  return user
    ? c.json({ user: publicUser(user) })
    : unauthorized(c);
});

userRoutes.patch("/api/me", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const username = asText(body.username) || user.username;
  const phone = asText(body.phone) || null;
  const [updated] = await db
    .update(users)
    .set({ username, phone, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  return c.json({ user: publicUser(updated) });
});

// Change password (requires the current password for safety).
userRoutes.post("/api/me/change-password", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const currentPassword = asText(body.currentPassword);
  const newPassword = asText(body.newPassword);
  if (!currentPassword || newPassword.length < 8)
    return c.json(
      { error: "กรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร" },
      400,
    );
  if (!(await passwordMatches(currentPassword, user.passwordHash)))
    return c.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, 401);
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  return c.json({ message: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" });
});

// Soft-delete: marks deletedAt so the row (and FK-linked pets/records) are
// retained for audit. `requireUser` already rejects deletedAt users, so the
// existing token is effectively invalidated for future requests.
userRoutes.delete("/api/me", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  await db
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  return c.body(null, 204);
});
