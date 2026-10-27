import { and, asc, eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';
import { activities, carePlans, expenses, pets } from '../db/schema.js';
import { requireUser, unauthorized, type AppEnv } from './auth.js';

export async function editablePetIds(userId: number) {
  const rows = await db.select({ id: pets.petId }).from(pets).where(eq(pets.userId, userId)).orderBy(asc(pets.petId)).limit(3);
  return rows.map(row => row.id);
}

// Apply the same plan restriction to every write, including direct API calls.
export const petAccess = createMiddleware<AppEnv>(async (c, next) => {
  const match = c.req.path.match(/^\/api\/(pets|health-records|reminders|expenses|care-plans)(?:\/([^/]+))?/);
  if (!match || !['POST', 'PATCH', 'DELETE', 'PUT'].includes(c.req.method)) return next();
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const [, resource, rawId] = match;
  const targets: number[] = [];
  if (rawId) {
    const id = Number(rawId.replace(/^(exp|hr)-/, ''));
    if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'รหัสรายการไม่ถูกต้อง' }, 400);
    if (resource === 'pets') targets.push(id);
    else {
      const table = resource === 'care-plans' ? carePlans : resource === 'expenses' && !rawId.startsWith('hr-') ? expenses : activities;
      const [row] = await db.select({ petId: table.petId }).from(table).where(eq(table.id, id));
      if (!row) return c.json({ error: 'ไม่พบรายการ' }, 404);
      targets.push(row.petId);
    }
  }
  if (['POST', 'PATCH', 'PUT'].includes(c.req.method)) {
    const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    if (body.petId !== undefined) targets.push(Number(body.petId));
  }
  for (const id of targets) {
    if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'กรุณาเลือกสัตว์เลี้ยง' }, 400);
    const [pet] = await db.select({ id: pets.petId }).from(pets).where(and(eq(pets.petId, id), eq(pets.userId, user.id)));
    if (!pet) return c.json({ error: 'ไม่พบสัตว์เลี้ยง' }, 404);
  }
  if (user.planType === 'FREE' && targets.length) {
    const allowed = await editablePetIds(user.id);
    if (targets.some(id => !allowed.includes(id))) return c.json({ error: 'Free จัดการได้ 3 ตัวแรก สัตว์เลี้ยงตัวนี้ดูข้อมูลได้อย่างเดียว กรุณาอัปเกรดเพื่อแก้ไข', code: 'PET_PLAN_LIMIT' }, 403);
  }
  return next();
});
