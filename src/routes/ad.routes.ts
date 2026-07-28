import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { ads, pets } from "../db/schema.js";
import {
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";

export const adRoutes = new Hono<AppEnv>();

adRoutes.get("/api/ads", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  if (user.planType === "PREMIUM") return c.json({ ads: [] });

  const requestedCategoryId = c.req.query("petCategoryId");
  const petCategoryId =
    requestedCategoryId === undefined ? null : Number(requestedCategoryId);
  if (
    petCategoryId !== null &&
    (!Number.isInteger(petCategoryId) || petCategoryId <= 0)
  )
    return c.json({ error: "petCategoryId must be a positive integer" }, 400);

  const [pet] = await db
    .select({ categoryId: pets.petCategoryId })
    .from(pets)
    .where(
      petCategoryId === null
        ? eq(pets.userId, user.id)
        : and(eq(pets.userId, user.id), eq(pets.petCategoryId, petCategoryId)),
    )
    .limit(1);
  if (!pet)
    return petCategoryId === null
      ? c.json({ ads: [] })
      : c.json({ error: "pet category not found" }, 404);

  const result = await db
    .select()
    .from(ads)
    .where(
      and(
        eq(ads.isActive, true),
        eq(ads.petCategoryId, pet.categoryId),
      ),
    )
    .orderBy(desc(ads.createdAt));

  return c.json({ ads: result });
});
