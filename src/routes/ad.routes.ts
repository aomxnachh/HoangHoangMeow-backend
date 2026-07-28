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

  // Check user has at least one pet
  const [pet] = await db
    .select({ id: pets.petId })
    .from(pets)
    .where(eq(pets.userId, user.id))
    .limit(1);
  if (!pet) return c.json({ ads: [] });

  const result = await db
    .select()
    .from(ads)
    .where(eq(ads.isActive, true))
    .orderBy(desc(ads.createdAt));

  return c.json({ ads: result });
});
