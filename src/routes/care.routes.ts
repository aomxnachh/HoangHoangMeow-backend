import { and, asc, eq, getTableColumns, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { carePlans, careRecommends, petCategories, pets } from "../db/schema.js";
import {
  ownedPet,
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { asDate, asText, toNumber } from "../utils/helpers.js";

export const careRoutes = new Hono<AppEnv>();

careRoutes.get("/api/care-plans", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const rows = await db
    .select({
      id: carePlans.id,
      petId: carePlans.petId,
      petName: pets.name,
      title: carePlans.title,
      detail: carePlans.detail,
      frequencyDays: carePlans.frequencyDays,
      nextDueAt: carePlans.nextDueAt,
      status: carePlans.status,
    })
    .from(carePlans)
    .innerJoin(pets, eq(carePlans.petId, pets.petId))
    .where(eq(pets.userId, user.id))
    .orderBy(asc(carePlans.nextDueAt));
  return c.json({ plans: rows });
});

careRoutes.post("/api/care-plans", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petId = Number(body.petId),
    nextDueAt = body.nextDueAt === undefined ? null : asDate(body.nextDueAt);
  if (!(await ownedPet(user.id, petId)))
    return c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
  if (!asText(body.title) || (body.nextDueAt !== undefined && !nextDueAt))
    return c.json({ error: "กรอกชื่อแผนและวันดำเนินการให้ถูกต้อง" }, 400);
  const frequencyDays = toNumber(body.frequencyDays);
  const [plan] = await db
    .insert(carePlans)
    .values({
      petId,
      title: asText(body.title),
      detail: asText(body.detail) || null,
      frequencyDays:
        Number.isFinite(frequencyDays) && frequencyDays > 0
          ? frequencyDays
          : null,
      nextDueAt,
    })
    .returning();
  return c.json({ plan }, 201);
});

careRoutes.patch("/api/care-plans/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const [plan] = await db
    .select({ id: carePlans.id })
    .from(carePlans)
    .innerJoin(pets, eq(carePlans.petId, pets.petId))
    .where(and(eq(carePlans.id, id), eq(pets.userId, user.id)));
  if (!plan) return c.json({ error: "ไม่พบแผนดูแล" }, 404);
  const status = asText(body.status),
    title = asText(body.title),
    nextDueAt =
      body.nextDueAt !== undefined ? asDate(body.nextDueAt) : undefined;
  const frequencyDays =
    body.frequencyDays !== undefined ? toNumber(body.frequencyDays) : undefined;
  const values: Partial<typeof carePlans.$inferInsert> = { updatedAt: new Date() };
  if (status) {
    if (!["PENDING", "DONE", "CANCELLED"].includes(status))
      return c.json({ error: "สถานะแผนไม่ถูกต้อง" }, 400);
    values.status = status as "PENDING" | "DONE" | "CANCELLED";
  }
  if (title) values.title = title;
  if (body.detail !== undefined) values.detail = asText(body.detail) || null;
  if (body.frequencyDays !== undefined)
    values.frequencyDays =
      Number.isFinite(frequencyDays) && frequencyDays! > 0 ? frequencyDays : null;
  if (body.nextDueAt !== undefined) values.nextDueAt = nextDueAt;
  const [updatedPlan] = await db
    .update(carePlans)
    .set(values)
    .where(eq(carePlans.id, id))
    .returning();
  return c.json({ message: "อัปเดตแผนดูแลแล้ว", plan: updatedPlan });
});

careRoutes.delete("/api/care-plans/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const [plan] = await db
    .select({ id: carePlans.id })
    .from(carePlans)
    .innerJoin(pets, eq(carePlans.petId, pets.petId))
    .where(and(eq(carePlans.id, id), eq(pets.userId, user.id)));
  if (!plan) return c.json({ error: "ไม่พบแผนดูแล" }, 404);
  await db.delete(carePlans).where(eq(carePlans.id, id));
  return c.body(null, 204);
});

careRoutes.get("/api/care-recommendations", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const petRows = await db
    .select({
      petId: pets.petId,
      petName: pets.name,
      categoryId: pets.petCategoryId,
    })
    .from(pets)
    .where(eq(pets.userId, user.id));
  if (!petRows.length) {
    // No pets yet — return ALL recommendations from both categories
    const allRecommendations = await db
      .select({
        ...getTableColumns(careRecommends),
        species: petCategories.species,
      })
      .from(careRecommends)
      .leftJoin(
        petCategories,
        eq(careRecommends.petCategoryId, petCategories.id),
      )
      .orderBy(asc(careRecommends.id));

    const result = allRecommendations.map((rec) => ({
      ...rec,
      petId: null,
      petName: rec.species || "ทั่วไป",
    }));
    return c.json({ recommendations: result });
  }

  const categoryIdSet = new Set(petRows.map((pet) => pet.categoryId));

  const userCategories = await db
    .select({ id: petCategories.id, species: petCategories.species })
    .from(petCategories)
    .where(inArray(petCategories.id, [...categoryIdSet]));
  const speciesByCategory = new Map(
    userCategories.map((category) => [category.id, category.species]),
  );

  const allRecommendations = await db
    .select({
      ...getTableColumns(careRecommends),
      species: petCategories.species,
    })
    .from(careRecommends)
    .leftJoin(
      petCategories,
      eq(careRecommends.petCategoryId, petCategories.id),
    )
    .orderBy(asc(careRecommends.id));

  const result: Array<Record<string, unknown>> = [];

  for (const rec of allRecommendations) {
    if (rec.petCategoryId === null) {
      result.push({ ...rec, petId: petRows[0].petId, petName: "ทั่วไป" });
      continue;
    }
    const matchedPets = petRows.filter(
      (pet) => speciesByCategory.get(pet.categoryId) === rec.species,
    );
    for (const pet of matchedPets) {
      result.push({ ...rec, petId: pet.petId, petName: pet.petName });
    }
  }

  return c.json({ recommendations: result });
});
