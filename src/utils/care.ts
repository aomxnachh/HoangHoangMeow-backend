import { today, validDate, validatePet } from './validation.js';

export function profileWarning(pet: Record<string, unknown>) {
  if (!pet.breed || !pet.birthdate) return 'กรุณาระบุสายพันธุ์และอายุเพิ่มเติมเพื่อรับคำแนะนำ';
  if (Object.keys(validatePet(pet)).length) return 'ข้อมูลโปรไฟล์ไม่ถูกต้อง กรุณาแก้ไขข้อมูลโปรไฟล์ก่อน';
  return null;
}

export function ageGroup(birthdate: string) {
  if (!validDate(birthdate) || birthdate > today()) return null;
  const now = today();
  const years = Number(now.slice(0, 4)) - Number(birthdate.slice(0, 4)) - (now.slice(5) < birthdate.slice(5) ? 1 : 0);
  return years < 1 ? 'BABY' : years >= 7 ? 'SENIOR' : 'ADULT';
}

export function matchesCategory(pet: { species: string; breed: string | null }, item: { petCategoryId: number | null; species: string | null; breed: string | null }) {
  // The admin recommendation form selects a species, not a breed.
  return item.petCategoryId === null || pet.species.trim() === item.species?.trim();
}
