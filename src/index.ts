import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { CORS_ORIGINS, PORT } from "./config.js";
import { db } from "./db/index.js";
import { ads, careRecommends, petCategories, users } from "./db/schema.js";
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

serve({ fetch: app.fetch, port: PORT });
console.log(`Backend running on port ${PORT}`);
/* 
//Mock up adsssssssssssssss
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

    // Seed care recommendations if none exist
    const existingRecs = await db.select({ id: careRecommends.id }).from(careRecommends).limit(1);
    if (existingRecs.length === 0) {
      const categories = await db
        .select({ id: petCategories.id })
        .from(petCategories)
        .limit(2);
      const catId1 = categories[0]?.id || 1;
      const catId2 = categories[1]?.id || catId1;
      await db.insert(careRecommends).values([
        {
          petCategoryId: catId1,
          ageRange: "ALL",
          content: "ควรพาไปตรวจสุขภาพประจำปีอย่างน้อยปีละ 1 ครั้ง เพื่อตรวจเช็คสภาพร่างกายทั่วไป ตรวจเลือด และป้องกันโรค",
        },
        {
          petCategoryId: catId1,
          ageRange: "BABY",
          content: "ลูกสัตว์เลี้ยงควรได้รับวัคซีนเริ่มต้นเมื่ออายุ 6-8 สัปดาห์ และฉีดเสริมทุก 3-4 สัปดาห์จนถึง 16 สัปดาห์",
        },
        {
          petCategoryId: catId1,
          ageRange: "ADULT",
          content: "สัตว์เลี้ยงวัยโตควรได้รับอาหารที่เหมาะสมกับอายุและน้ำหนัก ควบคุมปริมาณอาหารไม่ให้อ้วนเกินไป และออกกำลังกายสม่ำเสมอ",
        },
        {
          petCategoryId: catId1,
          ageRange: "SENIOR",
          content: "สัตว์เลี้ยงสูงวัยควรตรวจสุขภาพทุก 6 เดือน เพิ่มอาหารเสริมบำรุงข้อต่อ และลดกิจกรรมที่หนักเกินไป",
        },
        {
          petCategoryId: catId2,
          ageRange: "ALL",
          content: "ทำความสะอาดหู ตัดเล็บ และแปรงขนเป็นประจำทุก 1-2 สัปดาห์ เพื่อป้องกันเชื้อราและปรสิต",
        },
        {
          petCategoryId: catId2,
          ageRange: "ALL",
          content: "ควรฉีดวัคซีนป้องกันพิษสุนัขบ้าทุกปี และวัคซีนรวมตามกำหนดการที่สัตวแพทย์แนะนำ",
        },
      ]);
      console.log("Seeded 6 sample care recommendations");
    }
  } catch (err) {
    console.error("Seed skipped:", err);
  }
})();
*/
