import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
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
import { today } from '../utils/validation.js';
import { validateExpense } from '../utils/validation.js';

const asText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const toNumber = (value: unknown) =>
  typeof value === "number" ? value : Number(value);
const isDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const expenseRoutes = new Hono<AppEnv>();

expenseRoutes.get("/api/expenses", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const [expenseRows, healthRows] = await Promise.all([
    db
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
      .where(eq(pets.userId, user.id)),
    db
      .select({
        id: activities.id,
        petId: activities.petId,
        petName: pets.name,
        category: activities.activityType,
        description: activities.title,
        date: activities.activityDate,
        amount: activities.cost,
      })
      .from(activities)
      .innerJoin(pets, eq(activities.petId, pets.petId))
      .where(
        and(
          eq(pets.userId, user.id),
          eq(activities.entryType, "HEALTH_RECORD"),
          isNotNull(activities.cost)
        )
      )
  ]);

  const combined = [
    ...expenseRows.map((r) => ({ ...r, id: `exp-${r.id}` })),
    ...healthRows
      .filter((r) => Number(r.amount) > 0)
      .map((r) => ({ ...r, id: `hr-${r.id}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const year = c.req.query('year');
  const month = c.req.query('month');
  if ((year && !/^(19|20|21)\d{2}$/.test(year)) || (month && (!year || !/^(0[1-9]|1[0-2])$/.test(month)))) return c.json({ error: 'ปีหรือเดือนไม่ถูกต้อง' }, 400);
  const prefix = year ? year + (month ? `-${month}` : '') : '';
  const filtered = combined.filter(row => row.date.startsWith(prefix));
  return c.json({ expenses: filtered, total: Math.round(filtered.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100 });
});

expenseRoutes.post("/api/expenses", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const body = await c.req.json<Record<string, unknown>>();
  const validationError = validateExpense(body);
  if (validationError) return c.json({ error: validationError }, 400);
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
  const idParam = c.req.param("id");
  
  if (idParam.startsWith("hr-")) {
    const id = Number(idParam.replace("hr-", ""));
    const [record] = await db
      .select({ id: activities.id })
      .from(activities)
      .innerJoin(pets, eq(activities.petId, pets.petId))
      .where(and(eq(activities.id, id), eq(pets.userId, user.id)));
    if (!record) return c.json({ error: "ไม่พบรายการ" }, 404);
    await db.delete(activities).where(eq(activities.id, id));
  } else {
    const id = Number(idParam.replace("exp-", ""));
    const [expense] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .innerJoin(pets, eq(expenses.petId, pets.petId))
      .where(and(eq(expenses.id, id), eq(pets.userId, user.id)));
    if (!expense) return c.json({ error: "ไม่พบรายการ" }, 404);
    await db.delete(expenses).where(eq(expenses.id, id));
  }
  return c.body(null, 204);
});

expenseRoutes.patch("/api/expenses/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const idParam = c.req.param("id");
  if (idParam.startsWith("hr-")) return c.json({ error: "ไม่สามารถแก้ไขรายการบันทึกสุขภาพจากหน้านี้ได้" }, 400);
  const id = Number(idParam.replace("exp-", ""));
  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .innerJoin(pets, eq(expenses.petId, pets.petId))
    .where(and(eq(expenses.id, id), eq(pets.userId, user.id)));
  if (!existing) return c.json({ error: "ไม่พบรายการ" }, 404);
  const body = await c.req.json<Record<string, unknown>>();
  const validationError = validateExpense(body, true);
  if (validationError) return c.json({ error: validationError }, 400);
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
  const [expenseRows, healthRows] = await Promise.all([
    db
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
      ),
    db
      .select({
        category: activities.activityType,
        amount: activities.cost,
        date: activities.activityDate,
      })
      .from(activities)
      .innerJoin(pets, eq(activities.petId, pets.petId))
      .where(
        and(
          eq(pets.userId, user.id),
          eq(activities.entryType, "HEALTH_RECORD"),
          isNotNull(activities.cost),
          ...(petId ? [eq(activities.petId, petId)] : []),
        ),
      ),
  ]);

  const rows = [...expenseRows, ...healthRows].filter((r) => Number(r.amount) > 0);

  const vaccineTotal = rows
    .filter((r) => /วัคซีน|vaccin/i.test(r.category))
    .reduce((sum, r) => sum + Number(r.amount), 0);
    
  const checkupTotal = rows
    .filter((r) => /ตรวจสุขภาพ|ตรวจ|checkup|health/i.test(r.category))
    .reduce((sum, r) => sum + Number(r.amount), 0);
    
  const generalTotal = rows
    .filter((r) => !/วัคซีน|vaccin|ตรวจสุขภาพ|ตรวจ|checkup|health/i.test(r.category))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const estimates = [
    {
      name: "ค่าวัคซีนประจำปี",
      description: "ประมาณการจากประวัติการฉีดวัคซีน",
      cost: vaccineTotal > 0 ? vaccineTotal : 1000,
    },
    {
      name: "ค่าตรวจสุขภาพ",
      description: "แนะนำตรวจเลือดและสุขภาพทั่วไปปีละ 1 ครั้ง",
      cost: checkupTotal > 0 ? checkupTotal : 1500,
    },
    {
      name: "ค่ารักษาพยาบาลและอื่นๆ",
      description: "ค่าใช้จ่ายยา อาหารเสริม หรือเหตุฉุกเฉิน",
      cost: generalTotal > 0 ? Math.round(generalTotal * 0.2) : 2000,
    }
  ];

  return c.json({ estimates });
});

expenseRoutes.get("/api/dashboard", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const [allPets, allExpenses, reminders] = await Promise.all([
    petList(user.id),
    Promise.all([
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
          category: activities.activityType,
          amount: activities.cost,
          date: activities.activityDate,
          petId: activities.petId,
        })
        .from(activities)
        .innerJoin(pets, eq(activities.petId, pets.petId))
        .where(
          and(
            eq(pets.userId, user.id),
            eq(activities.entryType, "HEALTH_RECORD"),
            isNotNull(activities.cost)
          )
        )
    ]).then(([e, h]) => [...e, ...h].filter((r) => Number(r.amount) > 0)),
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

  const thisMonth = today().slice(0, 7);
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
