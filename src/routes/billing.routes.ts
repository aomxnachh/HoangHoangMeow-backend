import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { addDays, asText } from "../utils/helpers.js";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { APP_URL, PAYMENT_CHECKOUT_URL, PREMIUM_PRICE, PAYMENT_DEMO_ENABLED, PAYMENT_WEBHOOK_SECRET } from "../config.js";
import { db } from "../db/index.js";
import { payments, users } from "../db/schema.js";
import {
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { publicUser } from "../utils/auth.js";

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.get("/api/billing/options", async (c) => {
  if (!(await requireUser(c))) return unauthorized(c);
  return c.json({
    mode: PAYMENT_DEMO_ENABLED ? 'DEMO' : PAYMENT_CHECKOUT_URL ? 'LIVE' : 'UNAVAILABLE',
    amount: PREMIUM_PRICE,
  });
});

billingRoutes.get("/api/billing/history", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  return c.json({
    planType: user.planType,
    payments: await db
      .select()
      .from(payments)
      .where(eq(payments.userId, user.id))
      .orderBy(desc(payments.createdAt)),
  });
});

billingRoutes.post("/api/billing/checkout", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  if (user.planType === 'PREMIUM') return c.json({ error: 'คุณเป็น Premium อยู่แล้ว' }, 409);
  if (PAYMENT_DEMO_ENABLED) return c.json({ demo: true, amount: PREMIUM_PRICE });
  if (!PAYMENT_CHECKOUT_URL) {
    return c.json({ error: 'ยังไม่ได้เปิดบริการชำระเงิน กรุณาติดต่อผู้ดูแล', code: 'PAYMENT_NOT_CONFIGURED' }, 503);
  }

  const reference = `HHM-${user.id}-${randomUUID()}`;
  const [payment] = await db
    .insert(payments)
    .values({
      userId: user.id,
      amount: String(PREMIUM_PRICE),
      status: "PENDING",
      provider: "CARD",
      reference,
      periodEnd: addDays(new Date(), 30),
    })
    .returning();

  const checkoutUrl = `${PAYMENT_CHECKOUT_URL.replace(/\/$/, "")}?ref=${encodeURIComponent(reference)}`;
  return c.json({
    checkoutUrl,
    userId: user.id,
    amount: PREMIUM_PRICE,
    reference,
    paymentId: payment.id,
  });
});

billingRoutes.post("/api/billing/webhook", async (c) => {
  if (!PAYMENT_WEBHOOK_SECRET) return c.json({ error: 'payment webhook unavailable' }, 503);
  const timestamp = c.req.header('X-Payment-Timestamp') || '';
  const signature = c.req.header('X-Payment-Signature') || '';
  const rawBody = await c.req.text();
  const expected = createHmac('sha256', PAYMENT_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > 300000 || !/^[a-f0-9]{64}$/i.test(signature) || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return c.json({ error: 'invalid payment signature' }, 401);

  const body: Record<string, unknown> = await c
    .req
    .json<Record<string, unknown>>()
    .catch(() => ({}));
  const reference = asText(body.reference);
  const status = asText(body.status).toUpperCase();
  if (!reference)
    return c.json({ error: "missing" }, 400);

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.reference, reference));
  if (!payment) return c.json({ error: "payment not found" }, 404);

  if (status === "SUCCESS") {
    if (payment.status !== "PENDING")
      return c.json({ message: "payment was already processed" });
    await db.transaction(async (tx) => {
      const changed = await tx
        .update(payments)
        .set({ status: "SUCCESS", updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING"))).returning();
      if (!changed.length) return;
      await tx
        .update(users)
        .set({ planType: "PREMIUM", updatedAt: new Date() })
        .where(eq(users.id, payment.userId));
    });
    return c.json({ message: "upgraded to PREMIUM" });
  }
  if (status === "FAILED") {
    if (payment.status !== "PENDING")
      return c.json({ message: "payment was already processed" });
    await db
      .update(payments)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")));
    return c.json({ message: "payment marked failed" });
  }
  return c.json({ message: "no action" });
});

billingRoutes.post("/api/billing/cancel", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(payments.userId, user.id), eq(payments.status, "SUCCESS")),
      );
    const [updated] = await tx
      .update(users)
      .set({ planType: "FREE", updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    c.set("user", updated);
  });
  const [updated] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id));
  return c.json({
    message: "ยกเลิกการสมัคร Premium แล้ว แพ็กเกจเปลี่ยนเป็น Free ทันที",
    user: updated ? publicUser(updated) : null,
  });
});

billingRoutes.get("/api/billing/verify", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const reference = asText(c.req.query("ref"));
  if (!reference) return c.json({ error: "ไม่มีรหัสอ้างอิง" }, 400);

  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.reference, reference), eq(payments.userId, user.id)),
    );
  if (!payment) return c.json({ error: "ไม่พบรายการชำระเงิน" }, 404);

  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id));

  return c.json({
    status: payment.status,
    amount: payment.amount,
    reference: payment.reference,
    createdAt: payment.createdAt,
    periodEnd: payment.periodEnd,
    user: currentUser ? publicUser(currentUser) : null,
  });
});

billingRoutes.post("/api/billing/simulate-payment", async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  if (!PAYMENT_DEMO_ENABLED) return c.json({ error: 'ไม่เปิดใช้การชำระเงินจำลอง' }, 403);
  const body = await c.req.json<Record<string, unknown>>();
  if (!['CREDIT', 'DEBIT'].includes(asText(body.cardType)) || !['SUCCESS', 'FAILED'].includes(asText(body.result))) return c.json({ error: 'กรุณาเลือกประเภทบัตรและผลการชำระเงินจำลอง' }, 400);
  // Accept only scenario choices, never real card numbers or security codes.
  if (Object.keys(body).some(key => !['cardType', 'result'].includes(key))) return c.json({ error: 'ห้ามส่งข้อมูลบัตรจริงในระบบจำลอง' }, 400);
  const reference = `DEMO-${randomUUID()}`;
  const success = body.result === 'SUCCESS';
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
    if (current.planType === 'PREMIUM') return null;
    const [payment] = await tx.insert(payments).values({ userId: user.id, amount: String(PREMIUM_PRICE), status: success ? 'SUCCESS' : 'FAILED', provider: `DEMO_${body.cardType}`, reference, periodEnd: success ? addDays(new Date(), 30) : null }).returning();
    if (success) await tx.update(users).set({ planType: 'PREMIUM', updatedAt: new Date() }).where(eq(users.id, user.id));
    return payment;
  });
  if (!result) return c.json({ error: 'คุณเป็น Premium อยู่แล้ว' }, 409);
  const [updated] = await db.select().from(users).where(eq(users.id, user.id));
  return c.json({ message: success ? 'ชำระเงินจำลองสำเร็จ เปลี่ยนเป็น Premium แล้ว ไม่มีการหักเงินจริง' : 'ชำระเงินจำลองไม่สำเร็จ กรุณาลองอีกครั้ง', status: result.status, reference, user: publicUser(updated) });
});
