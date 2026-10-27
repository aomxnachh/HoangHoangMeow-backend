import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { ads, petCategories } from "../db/schema.js";
import { requireUser, unauthorized, type AppEnv } from "../middleware/auth.js";
import { petList } from './_shared.js';
import { availableProductLink } from '../utils/product-link.js';

export const adRoutes = new Hono<AppEnv>();

adRoutes.get('/api/ads', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  if (user.planType === 'PREMIUM') return c.json({ ads: [] });
  const petId = Number(c.req.query('petId'));
  const petRows = (await petList(user.id)).filter((p) => !petId || p.id === petId);
  const location = (c.req.query('location') || 'HOME').toUpperCase();
  const topic = c.req.query('topic') || '';
  const topics = ['อาหาร', 'วัคซีน', 'เห็บ', 'หมัด', 'ขน', 'สุขภาพ'];
  const keywords = topics.filter((word) => topic.includes(word));
  const rows = await db.select({ ...getTableColumns(ads), species: petCategories.species, breed: petCategories.breed })
    .from(ads).leftJoin(petCategories, eq(ads.petCategoryId, petCategories.id)).where(eq(ads.isActive, true)).orderBy(desc(ads.createdAt), desc(ads.id));
  const result = rows.filter((ad) => {
    const placement = (ad.location || 'HOME').toUpperCase();
    const inLocation = placement === 'ALL' || placement === location || (location === 'HOME' && placement === 'DASHBOARD');
    // Admin ads target a species; its category ID may reference any breed of that species.
    const relevant = ad.petCategoryId === null || petRows.some((pet) => pet.species.trim() === ad.species?.trim());
    const text = `${ad.title || ''} ${ad.content}`;
    return inLocation && relevant && (!keywords.length || keywords.some((word) => text.includes(word)));
  });
  return c.json({ ads: result });
});

adRoutes.get('/api/products/:id', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: 'ไม่พบหน้านี้' }, 404);
  const [product] = await db.select().from(ads).where(and(eq(ads.id, id), eq(ads.isActive, true)));
  if (!product || !product.targetUrl) return c.json({ error: 'สินค้าหมดชั่วคราว หรือไม่พบหน้านี้' }, 404);
  return c.json({ product });
});

adRoutes.post('/api/products/:id/checkout', async (c) => {
  const user = await requireUser(c);
  if (!user) return unauthorized(c);
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: 'ไม่พบหน้านี้' }, 404);
  const [product] = await db.select().from(ads).where(and(eq(ads.id, id), eq(ads.isActive, true)));
  if (!product?.targetUrl) return c.json({ error: 'สินค้าหมดชั่วคราว หรือไม่พบหน้านี้' }, 404);
  if (product.targetUrl.startsWith('/') && !product.targetUrl.startsWith('//') && !product.targetUrl.includes('\\')) return c.json({ url: product.targetUrl });
  if (!await availableProductLink(product.targetUrl)) return c.json({ error: 'สินค้าหมดชั่วคราว หรือไม่พบหน้านี้ กรุณาลองใหม่ภายหลัง' }, 410);
  return c.json({ url: product.targetUrl });
});
