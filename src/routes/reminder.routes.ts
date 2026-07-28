// Reminders & appointments (FR4.1–4.5). Activities with entryType REMINDER.
//   - Custom date/time creation (FR4.3)
//   - "Done" saves a health record + schedules next cycle (FR4.4)
//   - "Snooze" reschedules; reminder stays pending until done (FR4.5)
//   - Optional advance reminder (reminderMinutes) (FR4.2)

import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { activities, pets } from "../db/schema.js";
import {
  ownedPet,
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { addDays, asDate, asText, dateOnly, toNumber } from "../utils/helpers.js";

export const reminderRoutes = new Hono<AppEnv>();

reminderRoutes.get("/api/reminders", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const rows = await db
    .select({
      id: activities.id,
      petId: activities.petId,
      petName: pets.name,
      type: activities.activityType,
      title: activities.title,
      description: activities.detail,
      scheduledAt: activities.scheduledAt,
      reminderMinutes: activities.reminderMinutes,
      recurrenceDays: activities.recurrenceDays,
      status: activities.status,
      productUrl: activities.productUrl,
    })
    .from(activities)
    .innerJoin(pets, eq(activities.petId, pets.petId))
    .where(and(eq(pets.userId, user.id), eq(activities.entryType, "REMINDER")))
    .orderBy(asc(activities.scheduledAt));
  return c.json({ reminders: rows });
});

// Create a reminder with a custom scheduled date/time (FR4.3).
reminderRoutes.post("/api/reminders", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petId = Number(body.petId);
  const scheduledAt = asDate(body.scheduledAt);
  if (!(await ownedPet(user.id, petId)))
    return c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
  if (!asText(body.type) || !asText(body.title) || !scheduledAt)
    return c.json({ error: "กรอกประเภท หัวข้อ และกำหนดเวลาให้ครบถ้วน" }, 400);
  const recurrenceDays = toNumber(body.recurrenceDays);
  const reminderMinutes = toNumber(body.reminderMinutes);
  const [reminder] = await db
    .insert(activities)
    .values({
      petId,
      entryType: "REMINDER",
      activityType: asText(body.type),
      title: asText(body.title),
      detail: asText(body.description) || null,
      activityDate: dateOnly(scheduledAt),
      scheduledAt,
      recurrenceDays:
        Number.isFinite(recurrenceDays) && recurrenceDays > 0
          ? recurrenceDays
          : null,
      reminderMinutes:
        Number.isFinite(reminderMinutes) && reminderMinutes >= 0
          ? reminderMinutes
          : null,
      productUrl: asText(body.productUrl) || null,
    })
    .returning();
  return c.json({ reminder }, 201);
});

// "Done" — records the event into the health timeline and schedules the next
// recurrence automatically (FR4.4).
reminderRoutes.post("/api/reminders/:id/done", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const [reminder] = await db
    .select()
    .from(activities)
    .innerJoin(pets, eq(activities.petId, pets.petId))
    .where(
      and(
        eq(activities.id, id),
        eq(activities.entryType, "REMINDER"),
        eq(pets.userId, user.id),
      ),
    );
  if (!reminder) return c.json({ error: "ไม่พบการแจ้งเตือน" }, 404);
  const data = reminder.activity;
  if (data.status === "DONE")
    return c.json({ error: "รายการนี้ทำเสร็จแล้ว" }, 409);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(activities)
      .set({ status: "DONE", completedAt: now, updatedAt: now })
      .where(eq(activities.id, data.id));
    await tx.insert(activities).values({
      petId: data.petId,
      entryType: "HEALTH_RECORD",
      activityType: data.activityType,
      title: data.title,
      detail: data.detail,
      provider: data.provider,
      activityDate: dateOnly(now),
      status: "DONE",
      completedAt: now,
      productUrl: data.productUrl,
    });
    if (data.recurrenceDays && data.recurrenceDays > 0) {
      const nextAt = addDays(data.scheduledAt || now, data.recurrenceDays);
      await tx.insert(activities).values({
        petId: data.petId,
        entryType: "REMINDER",
        activityType: data.activityType,
        title: data.title,
        detail: data.detail,
        activityDate: dateOnly(nextAt),
        scheduledAt: nextAt,
        reminderMinutes: data.reminderMinutes,
        recurrenceDays: data.recurrenceDays,
        productUrl: data.productUrl,
      });
    }
  });
  return c.json({ message: "บันทึกประวัติและอัปเดตกำหนดการแล้ว" });
});

// "Snooze" — user picks a new time; reminder stays PENDING until done (FR4.5).
reminderRoutes.post("/api/reminders/:id/snooze", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const scheduledAt = asDate(body.scheduledAt);
  if (!scheduledAt) return c.json({ error: "กรุณาเลือกเวลาใหม่" }, 400);
  const [reminder] = await db
    .select({ id: activities.id })
    .from(activities)
    .innerJoin(pets, eq(activities.petId, pets.petId))
    .where(
      and(
        eq(activities.id, id),
        eq(activities.entryType, "REMINDER"),
        eq(pets.userId, user.id),
      ),
    );
  if (!reminder) return c.json({ error: "ไม่พบการแจ้งเตือน" }, 404);
  await db
    .update(activities)
    .set({
      scheduledAt,
      snoozedUntil: scheduledAt,
      activityDate: dateOnly(scheduledAt),
      updatedAt: new Date(),
    })
    .where(eq(activities.id, id));
  return c.json({ message: "เลื่อนการแจ้งเตือนแล้ว" });
});

reminderRoutes.patch("/api/reminders/:id", async (c) => {
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
        eq(activities.entryType, "REMINDER"),
        eq(pets.userId, user.id),
      ),
    );
  if (!existing) return c.json({ error: "ไม่พบการแจ้งเตือน" }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  const type = asText(body.type),
    title = asText(body.title),
    scheduledAt =
      body.scheduledAt !== undefined ? asDate(body.scheduledAt) : undefined;
  const recurrenceDays =
    body.recurrenceDays !== undefined ? toNumber(body.recurrenceDays) : undefined;
  const reminderMinutes =
    body.reminderMinutes !== undefined
      ? toNumber(body.reminderMinutes)
      : undefined;
  const values: Partial<typeof activities.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (type) values.activityType = type;
  if (title) values.title = title;
  if (body.description !== undefined)
    values.detail = asText(body.description) || null;
  if (scheduledAt) {
    values.scheduledAt = scheduledAt;
    values.activityDate = dateOnly(scheduledAt);
  }
  if (body.reminderMinutes !== undefined)
    values.reminderMinutes =
      Number.isFinite(reminderMinutes) && reminderMinutes! >= 0
        ? reminderMinutes
        : null;
  if (body.recurrenceDays !== undefined)
    values.recurrenceDays =
      Number.isFinite(recurrenceDays) && recurrenceDays! > 0
        ? recurrenceDays
        : null;
  if (body.productUrl !== undefined)
    values.productUrl = asText(body.productUrl) || null;
  const [reminder] = await db
    .update(activities)
    .set(values)
    .where(eq(activities.id, id))
    .returning();
  return c.json({ reminder });
});

reminderRoutes.delete("/api/reminders/:id", async (c) => {
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
        eq(activities.entryType, "REMINDER"),
        eq(pets.userId, user.id),
      ),
    );
  if (!record) return c.json({ error: "ไม่พบการแจ้งเตือน" }, 404);
  await db.delete(activities).where(eq(activities.id, id));
  return c.body(null, 204);
});
