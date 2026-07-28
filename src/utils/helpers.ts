export const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const toNumber = (value: unknown) =>
  typeof value === "number" ? value : Number(value);

export const asDate = (value: unknown) => {
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date;
};

export const dateOnly = (value: Date | string) =>
  (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);

export const ageFromBirthdate = (value: string | null) => {
  if (!value) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.valueOf())) return null;
  const months = Math.max(
    0,
    Math.floor((Date.now() - birth.valueOf()) / 2_629_746_000),
  );
  return `${Math.floor(months / 12)} ปี ${months % 12} เดือน`;
};

export const petEmoji = (species: string) => {
  const s = species.toLowerCase();
  if (species.includes("หมา") || s.includes("dog")) return "🐶";
  if (species.includes("กระต่าย") || s.includes("rabbit")) return "🐰";
  if (species.includes("หนู") || s.includes("hamster")) return "🐹";
  if (species.includes("นก") || s.includes("bird")) return "🐦";
  if (species.includes("ปลา") || s.includes("fish")) return "🐠";
  if (species.includes("งู") || s.includes("snake")) return "🐍";
  return "🐱";
};

export const isDateString = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export const addDays = (date: Date, days: number) =>
  new Date(date.valueOf() + days * 86_400_000);
