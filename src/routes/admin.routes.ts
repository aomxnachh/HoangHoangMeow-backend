import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { ads, careRecommends, pets, users } from "../db/schema.js";
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

adminRoutes.get("/api/admin/ads", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  return c.json({
    ads: await db.select().from(ads).orderBy(desc(ads.createdAt)),
  });
});

adminRoutes.post("/api/admin/ads", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petCategoryId = Number(body.petCategoryId);
  if (!Number.isInteger(petCategoryId) || !asText(body.content))
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
    values.petCategoryId = Number(body.petCategoryId);
  const [ad] = await db
    .update(ads)
    .set(values)
    .where(eq(ads.id, id))
    .returning();
  return ad ? c.json({ ad }) : c.json({ error: "ไม่พบโฆษณา" }, 404);
});

adminRoutes.get("/api/admin/recommendations", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  return c.json({
    recommendations: await db
      .select()
      .from(careRecommends)
      .orderBy(desc(careRecommends.createdAt)),
  });
});

adminRoutes.post("/api/admin/recommendations", async (c) => {
  if (!(await requireAdmin(c))) return forbidden(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petCategoryId = Number(body.petCategoryId);
  if (
    !Number.isInteger(petCategoryId) ||
    !asText(body.ageRange) ||
    !asText(body.content)
  )
    return c.json({ error: "กรอกข้อมูลคำแนะนำให้ครบถ้วน" }, 400);
  const [recommendation] = await db
    .insert(careRecommends)
    .values({
      petCategoryId,
      ageRange: asText(body.ageRange),
      content: asText(body.content),
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
  if (body.petCategoryId !== undefined)
    values.petCategoryId = Number(body.petCategoryId);
  const [recommendation] = await db
    .update(careRecommends)
    .set(values)
    .where(eq(careRecommends.id, id))
    .returning();
  return recommendation
    ? c.json({ recommendation })
    : c.json({ error: "ไม่พบคำแนะนำ" }, 404);
});
