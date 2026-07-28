import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { petCategories, pets } from "../db/schema.js";
import { ageFromBirthdate, petEmoji } from "../utils/helpers.js";

export async function findOrCreateCategory(
  speciesValue: string,
  breedValue: string,
) {
  const species = speciesValue.trim();
  const breed = breedValue.trim() || null;
  const where = breed
    ? and(eq(petCategories.species, species), eq(petCategories.breed, breed))
    : and(eq(petCategories.species, species), isNull(petCategories.breed));
  const [existing] = await db.select().from(petCategories).where(where);
  if (existing) return existing;
  const [created] = await db
    .insert(petCategories)
    .values({ species, breed })
    .returning();
  return created;
}

export async function petList(userId: number) {
  return db
    .select({
      id: pets.petId,
      name: pets.name,
      gender: pets.gender,
      weight: pets.weight,
      birthdate: pets.birthdate,
      avatarUrl: pets.avatarUrl,
      color: pets.color,
      allergies: pets.allergies,
      notes: pets.notes,
      species: petCategories.species,
      breed: petCategories.breed,
    })
    .from(pets)
    .innerJoin(petCategories, eq(pets.petCategoryId, petCategories.id))
    .where(eq(pets.userId, userId))
    .orderBy(desc(pets.createdAt));
}

export type PetRow = Awaited<ReturnType<typeof petList>>[number];

export function apiPet(row: PetRow) {
  return {
    ...row,
    image: row.avatarUrl || petEmoji(row.species),
    age: ageFromBirthdate(row.birthdate),
    status: "ปกติ",
  };
}
