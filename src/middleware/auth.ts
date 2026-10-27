import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/index.js";
import { pets, users } from "../db/schema.js";
import { verifyToken } from "../utils/auth.js";

export type User = typeof users.$inferSelect;

export type AppEnv = { Variables: { user: User } };

export type AppContext = Context<AppEnv>;

export async function requireUser(c: AppContext) {
  if (c.get("user")) return c.get("user");
  const authorization = c.req.header("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const id = verifyToken(token);
  if (!id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user || user.deletedAt) return null;
  c.set("user", user);
  return user;
}

export const unauthorized = (c: AppContext) =>
  c.json({ error: "กรุณาเข้าสู่ระบบ" }, 401);

export async function ownedPet(userId: number, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.petId, id), eq(pets.userId, userId)));
  return pet || null;
}

export async function requireAdmin(c: AppContext) {
  const user = await requireUser(c);
  return user?.role === "ADMIN" ? user : null;
}

export const forbidden = (c: AppContext) =>
  c.json({ error: "ต้องใช้สิทธิ์ผู้ดูแลระบบ" }, 403);
