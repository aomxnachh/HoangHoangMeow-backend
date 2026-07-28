// Pet profile CRUD + search/filter (FR2.1, FR2.2, FR2.3).
// Free plan is limited to 3 pets on creation (FR5.1).

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { pets } from "../db/schema.js";
import {
  ownedPet,
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { asText, toNumber } from "../utils/helpers.js";
import { apiPet, findOrCreateCategory, petList } from "./_shared.js";

export const petRoutes = new Hono<AppEnv>();

// List pets. Supports optional search/filter query params:
//   ?search=  name substring (case-insensitive)
//   ?species= exact species match
//   ?gender=  MALE | FEMALE | UNKNOWN
petRoutes.get("/api/pets", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const search = asText(c.req.query("search")).toLowerCase();
  const species = asText(c.req.query("species"));
  const gender = asText(c.req.query("gender"));
  let rows = await petList(user.id);
  if (search)
    rows = rows.filter((row) => row.name.toLowerCase().includes(search));
  if (species)
    rows = rows.filter(
      (row) => row.species.toLowerCase() === species.toLowerCase(),
    );
  if (gender && ["MALE", "FEMALE", "UNKNOWN"].includes(gender))
    rows = rows.filter((row) => row.gender === gender);
  return c.json({ pets: rows.map(apiPet) });
});

petRoutes.post("/api/pets", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const name = asText(body.name),
    species = asText(body.species),
    breed = asText(body.breed);
  if (!name || !species)
    return c.json({ error: "กรอกชื่อและชนิดสัตว์เลี้ยง" }, 400);

  const currentPets = await petList(user.id);
  if (user.planType === "FREE" && currentPets.length >= 3)
    return c.json(
      {
        error: "แพ็กเกจ Free เพิ่มสัตว์เลี้ยงได้สูงสุด 3 ตัว",
        code: "PET_LIMIT_REACHED",
      },
      403,
    );

  const category = await findOrCreateCategory(species, breed);
  const gender = ["MALE", "FEMALE", "UNKNOWN"].includes(asText(body.gender))
    ? (asText(body.gender) as "MALE" | "FEMALE" | "UNKNOWN")
    : "UNKNOWN";
  const weight = toNumber(body.weight);
  const birthdate = asText(body.birthdate) || null;
  const [pet] = await db
    .insert(pets)
    .values({
      userId: user.id,
      petCategoryId: category.id,
      name,
      gender,
      weight: Number.isFinite(weight) ? String(weight) : null,
      birthdate,
      avatarUrl: asText(body.avatarUrl) || null,
      color: asText(body.color) || null,
      allergies: asText(body.allergies) || null,
      notes: asText(body.notes) || null,
    })
    .returning();
  return c.json(
    {
      pet: apiPet({
        id: pet.petId,
        name: pet.name,
        gender: pet.gender,
        weight: pet.weight,
        birthdate: pet.birthdate,
        avatarUrl: pet.avatarUrl,
        color: pet.color,
        allergies: pet.allergies,
        notes: pet.notes,
        species: category.species,
        breed: category.breed,
      }),
    },
    201,
  );
});

petRoutes.get("/api/pets/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const pet = (await petList(user.id)).find((item) => item.id === id);
  return pet
    ? c.json({ pet: apiPet(pet) })
    : c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
});

petRoutes.patch("/api/pets/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const existing = await ownedPet(user.id, id);
  if (!existing) return c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  let categoryId = existing.petCategoryId;
  if (asText(body.species))
    categoryId = (
      await findOrCreateCategory(asText(body.species), asText(body.breed))
    ).id;
  const gender = asText(body.gender);
  const values: Partial<typeof pets.$inferInsert> = {
    petCategoryId: categoryId,
    name: asText(body.name) || existing.name,
    gender: ["MALE", "FEMALE", "UNKNOWN"].includes(gender)
      ? (gender as "MALE" | "FEMALE" | "UNKNOWN")
      : existing.gender,
    weight:
      body.weight === undefined
        ? existing.weight
        : Number.isFinite(toNumber(body.weight))
          ? String(toNumber(body.weight))
          : null,
    birthdate:
      body.birthdate === undefined
        ? existing.birthdate
        : asText(body.birthdate) || null,
    avatarUrl:
      body.avatarUrl === undefined
        ? existing.avatarUrl
        : asText(body.avatarUrl) || null,
    color:
      body.color === undefined ? existing.color : asText(body.color) || null,
    allergies:
      body.allergies === undefined
        ? existing.allergies
        : asText(body.allergies) || null,
    notes:
      body.notes === undefined ? existing.notes : asText(body.notes) || null,
    updatedAt: new Date(),
  };
  await db.update(pets).set(values).where(eq(pets.petId, id));
  const updated = (await petList(user.id)).find((item) => item.id === id)!;
  return c.json({ pet: apiPet(updated) });
});

petRoutes.delete("/api/pets/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  if (!(await ownedPet(user.id, id)))
    return c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
  // Related activities/expenses/care-plans cascade-delete via FK onDelete.
  await db.delete(pets).where(eq(pets.petId, id));
  return c.body(null, 204);
});
