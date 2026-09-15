import { desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { ads, petCategories, pets } from "../db/schema.js";
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

  const petRows = await db
    .select({ categoryId: pets.petCategoryId })
    .from(pets)
    .where(eq(pets.userId, user.id));

  const categoryIds = [...new Set(petRows.map((pet) => pet.categoryId))];
  const userCategories = categoryIds.length
    ? await db
        .select({ species: petCategories.species })
        .from(petCategories)
        .where(inArray(petCategories.id, categoryIds))
    : [];
  const speciesSet = new Set(userCategories.map((row) => row.species));

  const rows = await db
    .select({ ...getTableColumns(ads), species: petCategories.species })
    .from(ads)
    .leftJoin(petCategories, eq(ads.petCategoryId, petCategories.id))
    .where(eq(ads.isActive, true))
    .orderBy(desc(ads.createdAt));

  const result = categoryIds.length
    ? rows.filter(
        (ad) => ad.petCategoryId === null || speciesSet.has(ad.species!),
      )
    : rows;

  return c.json({ ads: result });
});
