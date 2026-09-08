import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { ads, careRecommends, petCategories, pets, users } from "../db/schema.js";
import {
  forbidden,
  requireAdmin,
  type AppEnv,
} from "../middleware/auth.js";
import { asText } from "../utils/helpers.js";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get("/api/admin/dashboard", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return forbidden(c);
  const allUsers = await db.select({ planType: users.planType }).from(users);
  const petCount = await db.select({ id: pets.petId }).from(pets);
  return c.json({
    users: allUsers.length,
    freeUsers: allUsers.filter((u) => u.planType === "FREE").length,
    premiumUsers: allUsers.filter((u) => u.planType === "PREMIUM").length,
    pets: petCount.length,
  });
});

adminRoutes.get("/api/admin/pet-species", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const rows = await db
    .select({
      id: sql<number>`min(${petCategories.id})::int`,
      species: petCategories.species,
    })
    .from(petCategories)
    .groupBy(petCategories.species)
    .orderBy(petCategories.species);
  return c.json({ categories: rows });
});

adminRoutes.get("/api/admin/ads", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const rows = await db
    .select({
      ...getTableColumns(ads),
      species: petCategories.species,
    })
    .from(ads)
    .leftJoin(petCategories, eq(ads.petCategoryId, petCategories.id))
    .orderBy(desc(ads.createdAt));
  return c.json({ ads: rows });
});

adminRoutes.post("/api/admin/ads", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petCategoryId =
    body.petCategoryId === null ||
    body.petCategoryId === undefined ||
    body.petCategoryId === ""
      ? null
      : Number(body.petCategoryId);
  if ((!Number.isInteger(petCategoryId) && petCategoryId !== null) || !asText(body.content))
    return c.json({ error: "กรอกหมวดสัตว์เลี้ยงและเนื้อหาโฆษณา" }, 400);
  const [ad] = await db
    .insert(ads)
    .values({
      petCategoryId,
      content: asText(body.content),
      title: asText(body.title) || null,
      location: asText(body.location) || "HOME",
      imageUrl: asText(body.imageUrl) || null,
      targetUrl: asText(body.targetUrl) || null,
    })
    .returning();
  return c.json({ ad }, 201);
});

adminRoutes.delete("/api/admin/ads/:id", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select({ id: ads.id }).from(ads).where(eq(ads.id, id));
  if (!existing) return c.json({ error: "ไม่พบโฆษณา" }, 404);
  await db.delete(ads).where(eq(ads.id, id));
  return c.body(null, 204);
});

adminRoutes.patch("/api/admin/ads/:id", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const values: Partial<typeof ads.$inferInsert> = {};
  if (body.title !== undefined) values.title = asText(body.title) || null;
  if (body.content !== undefined) values.content = asText(body.content);
  if (body.imageUrl !== undefined)
    values.imageUrl = asText(body.imageUrl) || null;
  if (body.targetUrl !== undefined)
    values.targetUrl = asText(body.targetUrl) || null;
  if (body.location !== undefined)
    values.location = asText(body.location) || "HOME";
  if (body.isActive !== undefined) values.isActive = Boolean(body.isActive);
  if (body.petCategoryId !== undefined)
    values.petCategoryId =
      body.petCategoryId === null || body.petCategoryId === ""
        ? null
        : Number(body.petCategoryId);
  const [ad] = await db
    .update(ads)
    .set(values)
    .where(eq(ads.id, id))
    .returning();
  return ad ? c.json({ ad }) : c.json({ error: "ไม่พบโฆษณา" }, 404);
});

adminRoutes.get("/api/admin/recommendations", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const rows = await db
    .select({
      ...getTableColumns(careRecommends),
      species: petCategories.species,
    })
    .from(careRecommends)
    .leftJoin(
      petCategories,
      eq(careRecommends.petCategoryId, petCategories.id),
    )
    .orderBy(desc(careRecommends.createdAt));
  return c.json({ recommendations: rows });
});

adminRoutes.post("/api/admin/recommendations", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petCategoryId =
    body.petCategoryId === null ||
    body.petCategoryId === undefined ||
    body.petCategoryId === ""
      ? null
      : Number(body.petCategoryId);
  if (
    (!Number.isInteger(petCategoryId) && petCategoryId !== null) ||
    !asText(body.ageRange) ||
    !asText(body.content)
  )
    return c.json({ error: "กรอกข้อมูลคำแนะนำให้ครบถ้วน" }, 400);
  const [recommendation] = await db
    .insert(careRecommends)
    .values({
      petCategoryId,
      ageRange: asText(body.ageRange),
      title: asText(body.title) || null,
      content: asText(body.content),
      imageUrl: asText(body.imageUrl) || null,
    })
    .returning();
  return c.json({ recommendation }, 201);
});

adminRoutes.delete("/api/admin/recommendations/:id", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const id = Number(c.req.param("id"));
  const [existing] = await db
    .select({ id: careRecommends.id })
    .from(careRecommends)
    .where(eq(careRecommends.id, id));
  if (!existing) return c.json({ error: "ไม่พบคำแนะนำ" }, 404);
  await db.delete(careRecommends).where(eq(careRecommends.id, id));
  return c.body(null, 204);
});

adminRoutes.patch("/api/admin/recommendations/:id", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const values: Partial<typeof careRecommends.$inferInsert> = {};
  if (body.ageRange !== undefined) values.ageRange = asText(body.ageRange);
  if (body.content !== undefined) values.content = asText(body.content);
  if (body.title !== undefined) values.title = asText(body.title) || null;
  if (body.imageUrl !== undefined) values.imageUrl = asText(body.imageUrl) || null;
  if (body.petCategoryId !== undefined)
    values.petCategoryId =
      body.petCategoryId === null || body.petCategoryId === ""
        ? null
        : Number(body.petCategoryId);
  const [recommendation] = await db
    .update(careRecommends)
    .set(values)
    .where(eq(careRecommends.id, id))
    .returning();
  return recommendation
    ? c.json({ recommendation })
    : c.json({ error: "ไม่พบคำแนะนำ" }, 404);
});

adminRoutes.get("/api/admin/users", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      phone: users.phone,
      role: users.role,
      planType: users.planType,
      authProvider: users.authProvider,
      deletedAt: users.deletedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
  return c.json({ users: allUsers });
});

adminRoutes.patch("/api/admin/users/:id", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  const role = asText(body.role);
  const planType = asText(body.planType);
  if (role && ["USER", "ADMIN"].includes(role))
    values.role = role as "USER" | "ADMIN";
  if (planType && ["FREE", "PREMIUM"].includes(planType))
    values.planType = planType as "FREE" | "PREMIUM";
  const [user] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, id))
    .returning();
  return user ? c.json({ user }) : c.json({ error: "ไม่พบผู้ใช้" }, 404);
});

adminRoutes.delete("/api/admin/users/:id", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const id = Number(c.req.param("id"));
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id));
  if (!existing) return c.json({ error: "ไม่พบผู้ใช้" }, 404);
  await db
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
  return c.body(null, 204);
});
