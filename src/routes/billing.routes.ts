import { addDays } from "../utils/helpers.js";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { PAYMENT_CHECKOUT_URL, PREMIUM_PRICE } from "../config.js";
import { db } from "../db/index.js";
import { payments, users } from "../db/schema.js";
import {
  requireUser,
  unauthorized,
  type AppEnv,
} from "../middleware/auth.js";
import { publicUser } from "../utils/auth.js";
import { asText } from "../utils/helpers.js";

export const billingRoutes = new Hono<AppEnv>();

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
  if (!PAYMENT_CHECKOUT_URL)
    return c.json(
      {
        error: "Error",
        code: "PAYMENT_NOT_CONFIGURED",
      },
      503,
    );

  const reference = `HHM-${user.id}-${Date.now()}`;
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
  const body: Record<string, unknown> = await c
    .req
    .json<Record<string, unknown>>()
    .catch(() => ({}));
  const reference = asText(body.reference);
  const status = asText(body.status).toUpperCase();
  if (!reference)
    return c.json({ error: "missing reference" }, 400);

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.reference, reference));
  if (!payment) return c.json({ error: "payment not found" }, 404);

  if (status === "SUCCESS") {
    if (payment.status !== "PENDING")
      return c.json({ message: "payment was already processed" });
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: "SUCCESS", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
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
      .where(eq(payments.id, payment.id));
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
