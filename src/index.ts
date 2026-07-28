// HoangHoangMeow backend entry point.
// Wires global middleware (CORS, error handler), public health routes, and the
// feature route modules, then starts the Hono server.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { CORS_ORIGINS, PORT } from "./config.js";
import { db } from "./db/index.js";
import { ads, petCategories, users } from "./db/schema.js";
import type { AppEnv } from "./middleware/auth.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { adRoutes } from "./routes/ad.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { billingRoutes } from "./routes/billing.routes.js";
import { careRoutes } from "./routes/care.routes.js";
import { expenseRoutes } from "./routes/expense.routes.js";
import { healthRecordRoutes } from "./routes/health-record.routes.js";
import { petRoutes } from "./routes/pet.routes.js";
import { reminderRoutes } from "./routes/reminder.routes.js";
import { userRoutes } from "./routes/user.routes.js";

const app = new Hono<AppEnv>();

// ----- Global middleware -----
app.use(
  "*",
  cors({
    origin: CORS_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "เกิดข้อผิดพลาดในระบบ" }, 500);
});

// ----- Public health/info routes -----
app.get("/", (c) => c.json({ message: "HoangHoangMeow backend is running" }));
app.get("/api/health", (c) => c.json({ status: "ok" }));
app.get("/api/db-check", async (c) => {
  try {
    const result = await db.select({ id: users.id }).from(users);
    return c.json({ connected: true, rowCount: result.length });
  } catch (error) {
    return c.json({ connected: false, error: String(error) }, 500);
  }
});

// ----- Feature routes -----
app.route("/", authRoutes);
app.route("/", userRoutes);
app.route("/", petRoutes);
app.route("/", healthRecordRoutes);
app.route("/", reminderRoutes);
app.route("/", expenseRoutes);
app.route("/", careRoutes);
app.route("/", adRoutes);
app.route("/", billingRoutes);
app.route("/", adminRoutes);

// ----- Server start -----
serve({ fetch: app.fetch, port: PORT });
console.log(`Backend running on port ${PORT}`);

// ----- Auto-seed sample ads if none exist -----
(async () => {
  try {
    const existingAds = await db.select({ id: ads.id }).from(ads).limit(1);
    if (existingAds.length === 0) {
      const categories = await db
        .select({ id: petCategories.id })
        .from(petCategories)
        .limit(1);
      const catId = categories[0]?.id || 1;
      await db.insert(ads).values([
        {
          petCategoryId: catId,
          title: "🐾 อาหารสัตว์เลี้ยงคุณภาพสูง",
          content:
            "อาหารเกรดพรีเมียม สูตรโปรตีนสูง เสริมวิตามินครบถ้วน ลด 20% สำหรับสมาชิกใหม่!",
          location: "HOME",
          isActive: true,
          targetUrl: "https://example.com/pet-food",
          imageUrl:
            "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=400&h=200&fit=crop",
        },
        {
          petCategoryId: catId,
          title: "🏥 ประกันสุขภาพสัตว์เลี้ยง",
          content:
            "คุ้มครองค่ารักษาสูงสุด 100,000 บาท เบี้ยเริ่มต้นเพียง 199 บาท/เดือน",
          location: "HOME",
          isActive: true,
          targetUrl: "https://example.com/pet-insurance",
          imageUrl:
            "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=200&fit=crop",
        },
        {
          petCategoryId: catId,
          title: "🎀 อุปกรณ์และของเล่นสัตว์เลี้ยง",
          content:
            "คอลเลคชั่นใหม่! สายจูง ของเล่น และที่นอนสัตว์เลี้ยงดีไซน์น่ารัก ส่งฟรีทั่วไทย",
          location: "HOME",
          isActive: true,
          targetUrl: "https://example.com/pet-accessories",
          imageUrl:
            "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400&h=200&fit=crop",
        },
        {
          petCategoryId: catId,
          title: "👑 อัปเกรดเป็น Premium วันนี้!",
          content:
            "ปลดล็อกทุกฟีเจอร์ ดูแลสัตว์เลี้ยงได้ไม่จำกัด เพียง 149 บาท/เดือน",
          location: "HOME",
          isActive: true,
          targetUrl: "/upgrade",
        },
      ]);
      console.log("Seeded 4 sample ads");
    }
  } catch (err) {
    console.error("Ads seed skipped:", err);
  }
})();
