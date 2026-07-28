import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { activities, expenses, pets } from "../db/schema.js";
import {
  ownedPet,
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { publicUser } from "../utils/auth.js";
import { apiPet, petList } from "./_shared.js";

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const toNumber = (value: unknown) =>
  typeof value === "number" ? value : Number(value);
const isDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const expenseRoutes = new Hono<AppEnv>();

expenseRoutes.get("/api/expenses", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const rows = await db
    .select({
      id: expenses.id,
      petId: expenses.petId,
      petName: pets.name,
      category: expenses.category,
      description: expenses.description,
      date: expenses.date,
      amount: expenses.amount,
    })
    .from(expenses)
    .innerJoin(pets, eq(expenses.petId, pets.petId))
    .where(eq(pets.userId, user.id))
    .orderBy(desc(expenses.date));
  return c.json({ expenses: rows });
});

expenseRoutes.post("/api/expenses", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const petId = Number(body.petId);
  const amount = toNumber(body.amount);
  const expenseDate = asText(body.date);
  if (!(await ownedPet(user.id, petId)))
    return c.json({ error: "ไม่พบสัตว์เลี้ยง" }, 404);
  if (
    !asText(body.category) ||
    !isDateString(expenseDate) ||
    !Number.isFinite(amount) ||
    amount < 0
  )
    return c.json({ error: "กรอกข้อมูลค่าใช้จ่ายให้ถูกต้อง" }, 400);
  const [expense] = await db
    .insert(expenses)
    .values({
      petId,
      category: asText(body.category),
      description: asText(body.description) || null,
      date: expenseDate,
      amount: String(amount),
    })
    .returning();
  return c.json({ expense }, 201);
});

expenseRoutes.delete("/api/expenses/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .innerJoin(pets, eq(expenses.petId, pets.petId))
    .where(and(eq(expenses.id, id), eq(pets.userId, user.id)));
  if (!expense) return c.json({ error: "ไม่พบรายการ" }, 404);
  await db.delete(expenses).where(eq(expenses.id, id));
  return c.body(null, 204);
});

expenseRoutes.patch("/api/expenses/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param("id"));
  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .innerJoin(pets, eq(expenses.petId, pets.petId))
    .where(and(eq(expenses.id, id), eq(pets.userId, user.id)));
  if (!existing) return c.json({ error: "ไม่พบรายการ" }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  const category = asText(body.category),
    expenseDate = asText(body.date),
    amount = body.amount !== undefined ? toNumber(body.amount) : undefined;
  const values: Partial<typeof expenses.$inferInsert> = {};
  if (category) values.category = category;
  if (body.description !== undefined)
    values.description = asText(body.description) || null;
  if (expenseDate && isDateString(expenseDate)) values.date = expenseDate;
  if (amount !== undefined && Number.isFinite(amount) && amount >= 0)
    values.amount = String(amount);
  const [expense] = await db
    .update(expenses)
    .set(values)
    .where(eq(expenses.id, id))
    .returning();
  return c.json({ expense });
});

expenseRoutes.get("/api/expenses/estimate", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const petId = Number(c.req.query("petId")) || null;
  const rows = await db
    .select({
      category: expenses.category,
      amount: expenses.amount,
      date: expenses.date,
    })
    .from(expenses)
    .innerJoin(pets, eq(expenses.petId, pets.petId))
    .where(
      and(
        eq(pets.userId, user.id),
        ...(petId ? [eq(expenses.petId, petId)] : []),
      ),
    );

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const windowStart = twelveMonthsAgo.toISOString().slice(0, 10);

  const stats = new Map<
    string,
    { total: number; count: number; lastDate: string; firstDate: string }
  >();
  for (const row of rows) {
    const stat = stats.get(row.category) || {
      total: 0,
      count: 0,
      lastDate: "",
      firstDate: "9999-99-99",
    };
    stat.total += Number(row.amount);
    stat.count += 1;
    if (row.date > stat.lastDate) stat.lastDate = row.date;
    if (row.date < stat.firstDate) stat.firstDate = row.date;
    stats.set(row.category, stat);
  }

  let totalEstimate = 0;
  const estimates = [...stats.entries()].map(([category, stat]) => {
    const monthsSpanned = Math.max(
      1,
      monthsBetween(stat.firstDate, stat.lastDate),
    );
    const recentRecords = rows.filter(
      (r) => r.category === category && r.date >= windowStart,
    );
    const recentAvg =
      recentRecords.length > 0
        ? recentRecords.reduce((sum, r) => sum + Number(r.amount), 0) /
          recentRecords.length
        : stat.total / stat.count;
    const avgCost = Math.round(recentAvg);
    const projectedMonthly = Math.round(
      category === "ค่ารักษาพยาบาล" || /รักษ|พยาบาล|vet|medical/i.test(category)
        ? recentAvg
        : (stat.total / monthsSpanned),
    );
    totalEstimate += projectedMonthly;
    return {
      category,
      avgCost,
      projectedMonthly,
      lastDate: stat.lastDate,
      count: stat.count,
    };
  });
  return c.json({ estimates, totalEstimate });
});

expenseRoutes.get("/api/dashboard", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const [allPets, allExpenses, reminders] = await Promise.all([
    petList(user.id),
    db
      .select({
        category: expenses.category,
        amount: expenses.amount,
        date: expenses.date,
        petId: expenses.petId,
      })
      .from(expenses)
      .innerJoin(pets, eq(expenses.petId, pets.petId))
      .where(eq(pets.userId, user.id)),
    db
      .select({
        id: activities.id,
        petName: pets.name,
        type: activities.activityType,
        title: activities.title,
        scheduledAt: activities.scheduledAt,
      })
      .from(activities)
      .innerJoin(pets, eq(activities.petId, pets.petId))
      .where(
        and(
          eq(pets.userId, user.id),
          eq(activities.entryType, "REMINDER"),
          eq(activities.status, "PENDING"),
        ),
      )
      .orderBy(asc(activities.scheduledAt)),
  ]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const totalThisMonth = allExpenses
    .filter((row) => row.date.startsWith(thisMonth))
    .reduce((total, row) => total + Number(row.amount), 0);

  const byPet = new Map<number, { petId: number; petName: string; total: number }>();
  for (const pet of allPets) {
    byPet.set(pet.id, { petId: pet.id, petName: pet.name, total: 0 });
  }
  for (const row of allExpenses) {
    const entry = byPet.get(row.petId);
    if (entry) entry.total += Number(row.amount);
  }

  const categoryTotals = new Map<string, number>();
  allExpenses.forEach((row) =>
    categoryTotals.set(
      row.category,
      (categoryTotals.get(row.category) || 0) + Number(row.amount),
    ),
  );
  const overall = [...categoryTotals.values()].reduce(
    (total, amount) => total + amount,
    0,
  );
  const monthly = new Map<string, number>();
  allExpenses.forEach((row) => {
    const month = row.date.slice(0, 7);
    monthly.set(month, (monthly.get(month) || 0) + Number(row.amount));
  });

  return c.json({
    user: publicUser(user),
    pets: allPets.map(apiPet),
    stats: {
      totalPets: allPets.length,
      activeReminders: reminders.length,
      totalThisMonth,
      upcomingVaccinations: reminders.filter((item) =>
        /วัคซีน|vaccine/i.test(item.type),
      ).length,
    },
    byCategory: [...categoryTotals.entries()].map(([category, amount]) => ({
      category,
      amount,
      percentage: overall ? Math.round((amount / overall) * 100) : 0,
    })),
    byPet: [...byPet.values()],
    monthlyTrend: [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({ month, amount })),
    upcoming: reminders.slice(0, 5),
  });
});

function monthsBetween(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.valueOf()) || Number.isNaN(e.valueOf())) return 1;
  return (
    Math.max(
      1,
      (e.getFullYear() - s.getFullYear()) * 12 +
        (e.getMonth() - s.getMonth()) +
        1,
    )
  );
}
