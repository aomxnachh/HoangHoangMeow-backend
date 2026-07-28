// Health records timeline (FR3.1, FR3.2). Activities with entryType
// HEALTH_RECORD store vaccine history, illness, treatments and medication.

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { activities, pets } from "../db/schema.js";
import {
  ownedPet,
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { asText, isDateString, toNumber } from "../utils/helpers.js";

export const healthRecordRoutes = new Hono<AppEnv>();

// Timeline ordered newest-first; optional ?petId filter.
healthRecordRoutes.get("/api/health-records", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const petId = Number(c.req.query("petId")) || null;
  const rows = await db
    .select({
      id: activities.id,
      petId: activities.petId,
      type: activities.activityType,
      title: activities.title,
      description: activities.detail,
      date: activities.activityDate,
      provider: activities.provider,
      cost: activities.cost,
      status: activities.status,
      petName: pets.name,
    })
    .from(activities)
    .innerJoin(pets, eq(activities.petId, pets.petId))
    .where(
      and(
        eq(pets.userId, user.id),
        eq(activities.entryType, "HEALTH_RECORD"),
        ...(petId ? [eq(activities.petId, petId)] : []),
      ),
    )
    .orderBy(desc(activities.activityDate));
  return c.json({ records: rows });
});

healthRecordRoutes.post("/api/health-records", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petId = Number(body.petId);
  if (!(await ownedPet(user.id, petId)))
    return c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
  const type = asText(body.type),
    title = asText(body.title),
    activityDate = asText(body.date);
  if (!type || !title || !isDateString(activityDate))
    return c.json({ error: "กรอกประเภท หัวข้อ และวันที่ให้ครบถ้วน" }, 400);
  const cost = toNumber(body.cost);
  const [record] = await db
    .insert(activities)
    .values({
      petId,
      entryType: "HEALTH_RECORD",
      activityType: type,
      title,
      detail: asText(body.description) || null,
      provider: asText(body.provider) || null,
      cost: Number.isFinite(cost) ? String(cost) : null,
      activityDate,
      status: "DONE",
      completedAt: new Date(),
    })
    .returning();
  return c.json({ record }, 201);
});

healthRecordRoutes.delete("/api/health-records/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const [record] = await db
    .select({ id: activities.id })
    .from(activities)
    .innerJoin(pets, eq(activities.petId, pets.petId))
    .where(
      and(
        eq(activities.id, id),
        eq(activities.entryType, "HEALTH_RECORD"),
        eq(pets.userId, user.id),
      ),
    );
  if (!record) return c.json({ error: "ไม่พบรายการ" }, 404);
  await db.delete(activities).where(eq(activities.id, id));
  return c.body(null, 204);
});

healthRecordRoutes.patch("/api/health-records/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .innerJoin(pets, eq(activities.petId, pets.petId))
    .where(
      and(
        eq(activities.id, id),
        eq(activities.entryType, "HEALTH_RECORD"),
        eq(pets.userId, user.id),
      ),
    );
  if (!existing) return c.json({ error: "ไม่พบรายการ" }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  const type = asText(body.type),
    title = asText(body.title),
    activityDate = asText(body.date);
  const values: Partial<typeof activities.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (type) values.activityType = type;
  if (title) values.title = title;
  if (body.description !== undefined)
    values.detail = asText(body.description) || null;
  if (activityDate && isDateString(activityDate))
    values.activityDate = activityDate;
  if (body.provider !== undefined)
    values.provider = asText(body.provider) || null;
  if (body.cost !== undefined) {
    const cost = toNumber(body.cost);
    values.cost = Number.isFinite(cost) ? String(cost) : null;
  }
  const [record] = await db
    .update(activities)
    .set(values)
    .where(eq(activities.id, id))
    .returning();
  return c.json({ record });
});
