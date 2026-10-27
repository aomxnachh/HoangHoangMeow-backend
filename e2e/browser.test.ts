import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { serve } from '@hono/node-server';
vi.mock('../src/db/index.js', async () => await import('../tests/test-db.js'));
vi.mock('../src/utils/product-link.js', () => ({ availableProductLink: vi.fn(async () => true) }));
import { app } from '../src/app.js';
import { client, db, initialize } from '../tests/test-db.js';
import { users, pets, petCategories, ads, careRecommends, carePlans, activities, expenses, payments } from '../src/db/schema.js';
import { hashPassword, publicUser, signToken } from '../src/utils/auth.js';
import { availableProductLink } from '../src/utils/product-link.js';
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium } = requireFrontend('playwright');
const base = 'http://127.0.0.1:5174';
let browser: any, page: any, server: ReturnType<typeof serve>, vite: ChildProcess, session: any;
let passwordHash: string;
const errors: string[] = [];

beforeAll(async () => {
  await initialize();
  passwordHash = await hashPassword('Acceptance123!');
  server = serve({ fetch: app.fetch, port: 4401, hostname: '127.0.0.1' });
  vite = spawn(process.execPath, [fileURLToPath(new URL('../../frontend/node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: '../frontend', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:4401' }, windowsHide: true, stdio: 'pipe' });
  let output = ''; vite.stderr?.on('data', (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (vite.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base)).ok) break; } catch {}
    await delay(300);
  }
  browser = await chromium.launch({ channel: process.env.E2E_BROWSER || 'chrome', headless: true });
  await mkdir('../test-results', { recursive: true });
});

beforeEach(async () => {
  await page?.context().close();
  await client.exec('TRUNCATE "user", pet_category, ads, care_recommend RESTART IDENTITY CASCADE');
  const [user] = await db.insert(users).values({ username: 'Acceptance', email: 'acceptance@example.test', passwordHash }).returning();
  session = { token: signToken(user as any), user: publicUser(user as any) };
  await db.insert(petCategories).values({ species: 'แมว', breed: 'เปอร์เซียร์' });
  await db.insert(pets).values({ userId: user.id, petCategoryId: 1, name: 'ไข่ตุ๋น', gender: 'FEMALE', birthdate: '2025-09-12', weight: '4.75', color: 'ขาว', allergies: 'วัคซีนลูคีเมีย', notes: 'ชอบกินกุ้ง' });
  await db.insert(careRecommends).values({ petCategoryId: 1, ageRange: 'ADULT', title: 'อาหารแมว', content: 'คำแนะนำอาหารสำหรับแมว' });
  await db.insert(ads).values({ petCategoryId: 1, location: 'ALL', title: 'อาหารแมว', content: 'อาหารแมว', targetUrl: 'https://example.com/cat-food' });
  vi.mocked(availableProductLink).mockResolvedValue(true);
  const context = await browser.newContext({ timezoneId: 'Asia/Bangkok', locale: 'th-TH', viewport: { width: 1365, height: 900 } });
  await context.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|accounts\.google\.com)\//, (route: any) => route.abort());
  await context.addInitScript((session: any) => { localStorage.setItem('hhm_token', session.token); localStorage.setItem('hhm_user', JSON.stringify(session.user)); }, session);
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date());
  page.on('pageerror', (error: Error) => errors.push(error.message));
});

afterEach(async (ctx) => { if (ctx.task.result?.state === 'fail' && page) { const name = ctx.task.name.slice(0, 45).replace(/[^a-zA-Z0-9]/g, '_'); await page.screenshot({ path: `../test-results/${name}.png`, fullPage: true }); await writeFile(`../test-results/${name}.txt`, await page.locator('body').innerText()); } });

afterAll(async () => {
  await browser?.close(); vite?.kill(); await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve()); await client.close();
  expect(errors).toEqual([]);
});

async function openReminder() { await page.goto(`${base}/reminders`, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'สร้างการแจ้งเตือน', exact: true }).first().click(); await page.locator('#reminder-pet option').first().waitFor({ state: 'attached' }); }
async function fillReminder(title = 'การฉีดวัคซีน') { await page.locator('#reminder-title').fill(title); await page.locator('#reminder-date').fill('2099-10-25'); await page.locator('#reminder-time').fill('09:00'); }
async function saveReminder() { await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); }
async function createReminder() { await openReminder(); await fillReminder(); await saveReminder(); await page.getByRole('cell', { name: 'การฉีดวัคซีน', exact: true }).waitFor(); }

it('Reminder TC01/TC07: create, edit, confirm and survive reload', async () => {
  await createReminder(); await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  expect(await page.locator('#reminder-time').inputValue()).toBe('09:00');
  await page.locator('#reminder-title').fill('การฉีดวัคซีนกระตุ้นเข็ม 2'); await page.locator('#reminder-date').fill('2099-10-30'); await page.locator('#reminder-time').fill('11:00'); await saveReminder();
  await page.getByRole('status').filter({ hasText: 'แก้ไขรายการแจ้งเตือนเรียบร้อยแล้ว' }).waitFor();
  await page.reload(); await page.getByRole('cell', { name: 'การฉีดวัคซีนกระตุ้นเข็ม 2', exact: true }).waitFor();
  expect(await page.getByText('11:00', { exact: true }).count()).toBe(1);
  await page.screenshot({ path: '../test-results/reminders-edited.png', fullPage: true });
});
it('Reminder TC02/TC03: blank and past creates show errors', async () => {
  await openReminder(); await fillReminder('   '); await saveReminder(); await page.getByRole('alert').waitFor(); expect(await page.getByRole('alert').innerText()).toContain('ครบถ้วน');
  await fillReminder(); await page.locator('#reminder-date').fill('2020-09-25'); await saveReminder(); expect(await page.getByRole('alert').innerText()).toContain('ผ่านมาแล้ว'); expect(await db.select().from(activities)).toHaveLength(0);
});
it('Reminder TC04/TC05/TC06: snooze validation appears inside dialog and status persists', async () => {
  await createReminder(); await page.getByRole('button', { name: 'เลื่อน', exact: true }).click();
  await page.locator('#snoozeDate').fill(''); await page.locator('#snoozeTime').fill(''); await page.getByRole('button', { name: 'ยืนยันเลื่อน' }).click(); expect(await page.getByRole('alert').innerText()).toContain('ครบถ้วน');
  await page.locator('#snoozeDate').fill('2020-09-25'); await page.locator('#snoozeTime').fill('09:00'); await page.getByRole('button', { name: 'ยืนยันเลื่อน' }).click(); expect(await page.getByRole('alert').innerText()).toContain('ผ่านไปแล้ว');
  await page.locator('#snoozeDate').fill('2099-10-30'); await page.locator('#snoozeTime').fill('13:00'); await page.getByRole('button', { name: 'ยืนยันเลื่อน' }).click(); await page.getByRole('cell', { name: 'เลื่อนเตือน', exact: true }).waitFor();
  await page.reload(); await page.getByRole('cell', { name: 'เลื่อนเตือน', exact: true }).waitFor(); expect(await page.getByText('13:00', { exact: true }).count()).toBe(1);
});
it('Reminder TC08/TC09: reject blank and past edits without changing saved reminder', async () => {
  await createReminder(); await page.getByRole('button', { name: 'แก้ไข', exact: true }).click(); await page.locator('#reminder-title').fill(''); await saveReminder(); expect(await page.getByRole('alert').innerText()).toContain('ครบถ้วน');
  await page.locator('#reminder-title').fill('changed'); await page.locator('#reminder-date').fill('2020-10-15'); await saveReminder(); expect(await page.getByRole('alert').innerText()).toContain('ผ่านมาแล้ว'); expect((await db.select().from(activities))[0].title).toBe('การฉีดวัคซีน');
});

async function openPet() { await page.goto(`${base}/pets`); await page.getByRole('button', { name: 'เพิ่มสัตว์เลี้ยง', exact: true }).click(); await page.locator('#pet-name').fill('มะลิ'); await page.locator('#pet-age').fill('2025-09-12'); await page.locator('#pet-weight').fill('4.75'); await page.locator('#pet-gender').selectOption('FEMALE'); await page.locator('#pet-breed').fill('เปอร์เซียร์'); await page.locator('#pet-color').fill('ขาว'); await page.locator('#pet-allergies').fill('ไม่มี'); await page.locator('#pet-notes').fill('ร่าเริง'); }
it('Pet TC01/04/07/10/13: valid complete profile persists', async () => { await openPet(); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); await page.locator('#pet-name').waitFor({ state: 'detached' }); await page.reload(); await page.getByText('มะลิ', { exact: true }).waitFor(); expect(await db.select().from(pets)).toHaveLength(2); });
it.each([
  ['TC02 special name', '#pet-name', '&^&'], ['TC03 blank name', '#pet-name', ''], ['TC05 future birthdate', '#pet-age', '2099-09-12'], ['TC06 blank birthdate', '#pet-age', ''], ['TC08 negative weight', '#pet-weight', '-0.05'], ['TC09 blank weight', '#pet-weight', ''], ['TC11 breed symbols', '#pet-breed', 'เปอร์เซียร์ ^>^'], ['TC14 long notes', '#pet-notes', 'ก'.repeat(501)]
])('Pet %s: show validation and keep form open', async (_id, field, value) => { await openPet(); await page.locator(field).fill(value); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); expect(await page.getByRole('alert').count()).toBeGreaterThan(0); expect(await page.locator(field).isVisible()).toBe(true); expect(await db.select().from(pets)).toHaveLength(1); });
it.each([['TC12 optional breed and color', ['#pet-breed', '#pet-color']], ['TC15 optional allergies and notes', ['#pet-allergies', '#pet-notes']]])('Pet %s: cancellation retains input, confirmation saves', async (_id, fields) => {
  await openPet(); for (const field of fields as string[]) await page.locator(field).fill('');
  page.once('dialog', (dialog: any) => dialog.dismiss()); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); expect(await page.locator('#pet-name').inputValue()).toBe('มะลิ'); expect(await db.select().from(pets)).toHaveLength(1);
  page.once('dialog', (dialog: any) => dialog.accept()); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); await page.locator('#pet-name').waitFor({ state: 'detached' }); await page.getByText('มะลิ', { exact: true }).click(); await page.waitForURL('**/pets/2'); await page.getByText('ข้อมูลทั่วไป', { exact: true }).waitFor(); expect(await page.locator('body').innerText()).toContain('-');
});
it('Expense TC01/04/07/10/13: decimal amount persists and dashboard updates', async () => {
  await page.goto(`${base}/expenses`); await page.getByRole('button', { name: '+ เพิ่มรายจ่าย' }).click(); await page.locator('#petId option').first().waitFor({ state: 'attached' });
  await page.locator('#description').fill('ขนมสุนัข'); await page.locator('#date').fill('2026-06-17'); await page.locator('#amount').fill('12345.75'); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); await page.locator('#description').waitFor({ state: 'detached' }); await page.reload(); await page.getByRole('cell', { name: 'ขนมสุนัข', exact: true }).waitFor(); expect(await page.locator('body').innerText()).toContain('12,345.75');
});
it('Expense TC02/03/05/08/11/14/15: required and malformed inputs cannot save', async () => {
  await page.goto(`${base}/expenses`); await page.getByRole('button', { name: '+ เพิ่มรายจ่าย' }).click(); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); expect(await page.locator('#description').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await page.locator('#description').fill('@#$@%#'); expect(await page.getByRole('button', { name: 'บันทึก', exact: true }).isDisabled()).toBe(true);
  await page.locator('#description').fill('ขนมสุนัข'); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); expect(await page.locator('#date').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await page.locator('#date').fill('2026-06-17'); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); expect(await page.locator('#amount').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await page.locator('#amount').pressSequentially('123--45'); expect(await page.locator('#amount').evaluate((el: HTMLInputElement) => !el.validity.valid)).toBe(true);
});
it('Care TC01/07/08/09/10: matching recommendations and product navigation', async () => {
  await page.goto(`${base}/`); await page.getByRole('link').filter({ hasText: 'อาหารแมว' }).first().waitFor();
  await page.goto(`${base}/reminders`, { waitUntil: 'domcontentloaded' }); await page.getByRole('region', { name: 'สินค้าแนะนำ' }).waitFor();
  await page.goto(`${base}/care`); await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).waitFor(); await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click(); await page.getByRole('heading', { name: 'อาหารแมว', exact: true }).click(); await page.getByText('ข้อมูลการแพ้ของ ไข่ตุ๋น: วัคซีนลูคีเมีย').waitFor(); await page.getByRole('region', { name: 'สินค้าแนะนำ' }).getByRole('link').first().click(); await page.getByRole('button', { name: 'ไปหน้าสั่งซื้อ' }).waitFor();
  expect(page.url()).toBe(`${base}/products/1`);
});
it('Care TC02/03: incomplete and invalid profiles show warnings', async () => {
  await db.update(pets).set({ birthdate: null }).where(eq(pets.petId, 1)); await page.goto(`${base}/care`); await page.getByRole('status').filter({ hasText: 'สายพันธุ์และอายุ' }).waitFor();
  await db.update(pets).set({ birthdate: '2077-09-12', weight: '-4.75' }).where(eq(pets.petId, 1)); await page.reload(); await page.getByRole('status').filter({ hasText: 'แก้ไขข้อมูลโปรไฟล์' }).waitFor(); expect(await page.getByRole('link', { name: 'แก้ไขโปรไฟล์' }).count()).toBe(1);
});
it('Care TC04: create plan through form', async () => {
  await page.goto(`${base}/care`); await page.getByRole('button', { name: '+ สร้างแผนดูแล' }).click(); await page.locator('#petId option').first().waitFor({ state: 'attached' }); expect(await page.locator('#detail').inputValue()).toContain('คำแนะนำอาหารสำหรับแมว'); await page.locator('#title').fill('แผนของไข่ตุ๋น'); await page.locator('#detail').fill('ข้อมูลการแพ้: วัคซีนลูคีเมีย\nแปรงขน'); await page.locator('#nextDueAt').fill('2099-10-30'); await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); await page.getByRole('heading', { name: 'แผนของไข่ตุ๋น' }).waitFor(); expect(await page.getByText('ทุก 1 วัน', { exact: false }).count()).toBeGreaterThan(0);
});
it('Care TC05/06: empty and unsupported pets guide to next step', async () => {
  await db.update(petCategories).set({ species: 'กิ้งก่า', breed: 'กิ้งก่า' }).where(eq(petCategories.id, 1)); await db.delete(careRecommends); await page.goto(`${base}/care`); await page.getByRole('status').filter({ hasText: 'ยังไม่มีแผนการดูแลมาตรฐาน' }).waitFor(); expect(await page.getByRole('link', { name: 'ตั้งค่าแจ้งเตือนด้วยตนเอง' }).count()).toBe(1);
  await db.delete(pets); await page.reload(); await page.getByRole('link', { name: 'เพิ่มข้อมูลสัตว์เลี้ยงตัวแรก', exact: true }).waitFor(); await page.getByRole('button', { name: '+ สร้างแผนดูแล' }).click(); expect(await page.locator('#petId').count()).toBe(0);
});
it('Care TC11: broken checkout and deleted products show recoverable errors', async () => {
  vi.mocked(availableProductLink).mockResolvedValue(false); await page.goto(`${base}/products/1`); await page.getByRole('button', { name: 'ไปหน้าสั่งซื้อ' }).click(); await page.getByRole('alert').waitFor(); expect(await page.getByRole('alert').innerText()).toContain('สินค้าหมดชั่วคราว'); await db.delete(ads); await page.reload(); await page.getByRole('alert').waitFor(); expect(await page.getByRole('alert').innerText()).toContain('ไม่พบหน้านี้');
});
it('Care TC12: expired session returns to the same product after login', async () => {
  await page.goto(`${base}/products/1`); await page.getByRole('button', { name: 'ไปหน้าสั่งซื้อ' }).waitFor(); await page.evaluate(() => localStorage.setItem('hhm_token', 'expired')); await page.getByRole('button', { name: 'ไปหน้าสั่งซื้อ' }).click(); await page.waitForURL('**/login?next=*');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/products/1');
  await page.locator('input[type="email"]').fill('acceptance@example.test'); await page.locator('input[type="password"]').fill('Acceptance123!'); await page.locator('form button').last().click(); await page.waitForURL('**/products/1'); await page.getByRole('button', { name: 'ไปหน้าสั่งซื้อ' }).waitFor();
});

it('Mobile reminder form remains usable and validates past date', async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await openReminder(); await fillReminder(); await page.locator('#reminder-date').fill('2020-01-01'); await saveReminder(); await page.getByRole('alert').waitFor(); expect(await page.getByRole('alert').innerText()).toContain('ผ่านมาแล้ว'); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: '../test-results/reminders-mobile.png', fullPage: true, animations: 'disabled' });
});
it('Anonymous product visit preserves return destination', async () => {
  const anonymous = await browser.newContext(); await anonymous.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|accounts\.google\.com)\//, (route: any) => route.abort()); const tab = await anonymous.newPage();
  try { await tab.goto(`${base}/products/1`, { waitUntil: 'domcontentloaded' }); await tab.waitForURL('**/login?next=*', { waitUntil: 'domcontentloaded' }); expect(new URL(tab.url()).searchParams.get('next')).toBe('/products/1'); }
  finally { await anonymous.close(); }
});


it('Round 2 FR02: require gender and upload pet image, edit and reload', async () => {
  await openPet();
  await page.locator('#pet-gender').selectOption('');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'เพศ' }).waitFor();
  await page.locator('#pet-gender').selectOption('FEMALE');
  const photo = await page.screenshot({ clip: { x: 0, y: 0, width: 40, height: 40 } });
  await page.getByLabel('รูปสัตว์เลี้ยง', { exact: true }).setInputFiles({ name: 'pet.png', mimeType: 'image/png', buffer: photo });
  await page.getByAltText('ตัวอย่างรูปสัตว์เลี้ยง').waitFor();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); await page.locator('#pet-name').waitFor({ state: 'detached' });
  await page.goto(`${base}/pets/2`); await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await page.getByAltText('ตัวอย่างรูปสัตว์เลี้ยง').waitFor(); await page.getByRole('button', { name: 'ลบรูป', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
  await page.getByAltText('ตัวอย่างรูปสัตว์เลี้ยง').waitFor({ state: 'detached' });
  expect((await db.select().from(pets).where(eq(pets.petId, 2)))[0].avatarUrl).toBeNull();
});
it('Round 2 FR03: health edit, search, chronological order and pet details', async () => {
  await db.insert(activities).values([
    { petId: 1, entryType: 'HEALTH_RECORD', activityType: 'วัคซีน', title: 'รายการเก่า', detail: 'รายละเอียดเก่า', activityDate: '2025-01-01', cost: '100' },
    { petId: 1, entryType: 'HEALTH_RECORD', activityType: 'ตรวจสุขภาพ', title: 'รายการล่าสุด', detail: 'ตรวจประจำปี', activityDate: '2026-01-01', cost: '200' }
  ]);
  await page.goto(`${base}/health`); await page.getByRole('button', { name: 'แก้ไขประวัติ รายการล่าสุด' }).click();
  await page.locator('#title').fill('แก้ไขแล้ว'); await page.locator('#description').fill('ตรวจครบทุกอย่าง'); await page.locator('#cost').fill('321.50');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click(); await page.locator('#title').waitFor({ state: 'detached' });
  await page.reload(); await page.getByRole('button', { name: 'แก้ไขประวัติ แก้ไขแล้ว' }).waitFor();
  expect(await page.locator('tbody tr').first().innerText()).toContain('แก้ไขแล้ว');
  await page.getByLabel('ค้นหาประวัติสุขภาพ').fill('ตรวจครบ'); expect(await page.locator('tbody tr').count()).toBe(1);
  await page.getByLabel('ค้นหาประวัติสุขภาพ').fill('ไม่มีในข้อมูล'); expect(await page.locator('tbody tr').count()).toBe(0);
  await page.goto(`${base}/pets/1`); await page.getByText('ตรวจครบทุกอย่าง', { exact: true }).waitFor();
  expect(await page.locator('body').innerText()).toContain('วัคซีนลูคีเมีย');
  await page.getByRole('button', { name: 'บันทึกสุขภาพ', exact: true }).click(); await page.getByText('ตรวจครบทุกอย่าง', { exact: true }).waitFor();
});
it('Round 2 FR01: demo card decline, credit success, billing history and downgrade lock', async () => {
  await page.goto(`${base}/upgrade`);
  await page.getByText('โหมดจำลองชำระเงิน — ไม่มีการเรียกเก็บเงินจริง', { exact: true }).waitFor();
  await page.getByRole('button').filter({ hasText: 'อัปเกรด' }).click();
  await page.getByRole('dialog', { name: 'ชำระเงินจำลอง' }).waitFor();
  await page.screenshot({ path: '../test-results/premium-simulated-checkout.png', fullPage: true });
  await page.getByLabel('ประเภทบัตร', { exact: true }).selectOption('DEBIT');
  await page.getByLabel('สถานการณ์ทดสอบ', { exact: true }).selectOption('FAILED');
  await page.getByRole('button', { name: 'ยืนยันชำระเงินจำลอง' }).click();
  await page.getByRole('alert').filter({ hasText: 'ไม่สำเร็จ' }).waitFor();
  expect((await db.select().from(users))[0].planType).toBe('FREE');
  await page.getByLabel('ประเภทบัตร', { exact: true }).selectOption('CREDIT'); await page.getByLabel('สถานการณ์ทดสอบ', { exact: true }).selectOption('SUCCESS');
  await page.getByRole('button', { name: 'ยืนยันชำระเงินจำลอง' }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  expect((await db.select().from(users))[0].planType).toBe('PREMIUM');
  await page.reload();
  await page.getByRole('button', { name: 'คุณใช้แพ็กเกจนี้อยู่แล้ว', exact: true }).waitFor();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hhm_user') || '{}').planType)).toBe('PREMIUM');
  await page.goto(`${base}/billing`); await page.getByText('เครดิต (จำลอง)', { exact: true }).waitFor();
  for (let i = 0; i < 3; i++) await db.insert(pets).values({ userId: 1, petCategoryId: 1, name: `Pet ${i}`, gender: 'MALE', birthdate: '2025-01-01', weight: '3' });
  await db.update(users).set({ planType: 'FREE' }).where(eq(users.id, 1));
  await page.goto(`${base}/pets/4`); await page.getByText('ดูข้อมูลได้อย่างเดียว', { exact: false }).waitFor();
  expect(await page.getByRole('button', { name: 'แก้ไข', exact: true }).isDisabled()).toBe(true);
  await page.getByRole('button', { name: 'บันทึกสุขภาพ', exact: true }).click();
  expect(await page.getByRole('button', { name: '+ เพิ่มบันทึก', exact: false }).isDisabled()).toBe(true);
});
it('Round 2 FR04: bell counts due only on every page, time ticks and snooze clears', async () => {
  const now = new Date();
  await db.insert(activities).values([
    { petId: 1, entryType: 'REMINDER', activityType: 'ยา', title: 'ถึงเวลาให้ยา', activityDate: '2026-01-01', scheduledAt: new Date(now.valueOf() - 60000) },
    { petId: 1, entryType: 'REMINDER', activityType: 'วัคซีน', title: 'ยังไม่ถึงเวลา', activityDate: '2099-01-01', scheduledAt: new Date('2099-01-01T00:00:00Z') },
    { petId: 1, entryType: 'REMINDER', activityType: 'ยา', title: 'ล่วงหน้าห้านาที', activityDate: '2026-01-01', scheduledAt: new Date(now.valueOf() + 10 * 60000), reminderMinutes: 5 }
  ]);
  await page.goto(`${base}/health`); await page.getByRole('link', { name: 'การแจ้งเตือนที่ถึงเวลา 1 รายการ', exact: true }).waitFor();
  await page.getByRole('link', { name: 'ค่าใช้จ่าย', exact: true }).click(); await page.getByRole('link', { name: 'การแจ้งเตือนที่ถึงเวลา 1 รายการ', exact: true }).waitFor();
  await page.clock.setFixedTime(new Date(now.valueOf() + 6 * 60000));
  await page.getByRole('link', { name: 'การแจ้งเตือนที่ถึงเวลา 2 รายการ', exact: true }).waitFor();
  await page.clock.setFixedTime(now);
  await page.goto(`${base}/reminders`); await page.getByRole('cell', { name: 'เกินกำหนด', exact: true }).waitFor();
  const row = page.locator('tr').filter({ has: page.getByRole('cell', { name: 'ถึงเวลาให้ยา', exact: true }) });
  await row.getByRole('button', { name: 'เลื่อน', exact: true }).click();
  await page.locator('#snoozeDate').fill('2099-01-01'); await page.locator('#snoozeTime').fill('09:00'); await page.getByRole('button', { name: 'ยืนยันเลื่อน' }).click();
  await page.getByRole('link', { name: 'การแจ้งเตือนที่ถึงเวลา 0 รายการ', exact: true }).waitFor();
});
it('Round 2 FR06: monthly and yearly summaries follow selected period', async () => {
  await db.insert(expenses).values([
    { petId: 1, category: 'อาหาร', description: 'ปีก่อน', date: '2025-01-01', amount: '100' },
    { petId: 1, category: 'อาหาร', description: 'กันยายน', date: '2026-09-01', amount: '200' },
    { petId: 1, category: 'อาหาร', description: 'ตุลาคม', date: '2026-10-01', amount: '300' }
  ]);
  await page.goto(`${base}/expenses`); await page.getByRole('cell', { name: 'ตุลาคม', exact: true }).waitFor();
  await page.getByLabel('ช่วงเวลาค่าใช้จ่าย').selectOption('month'); await page.getByLabel('ปีค่าใช้จ่าย').selectOption('2026'); await page.getByLabel('เดือนค่าใช้จ่าย').selectOption('10');
  expect(await page.locator('tbody tr').count()).toBe(1); expect(await page.locator('tbody').innerText()).toContain('ตุลาคม');
  await page.getByLabel('ช่วงเวลาค่าใช้จ่าย').selectOption('year'); expect(await page.locator('tbody tr').count()).toBe(2);
  await page.getByLabel('ปีค่าใช้จ่าย').selectOption('2025'); expect(await page.locator('tbody tr').count()).toBe(1); expect(await page.locator('tbody').innerText()).toContain('ปีก่อน');
});
it('Round 2 NFR: mobile navigation and every main page fits 320 and 360 px with long data', async () => {
  await db.update(pets).set({ name: 'LongPetName'.repeat(10).slice(0, 100) }).where(eq(pets.petId, 1));
  await db.insert(activities).values({ petId: 1, entryType: 'HEALTH_RECORD', activityType: 'วัคซีน', title: 'LongHealthRecord'.repeat(15), detail: 'รายละเอียดที่ยาว'.repeat(20), activityDate: '2026-01-01', cost: '99999.99' });
  await db.insert(expenses).values(Array.from({ length: 12 }, (_, month) => ({ petId: 1, category: 'อาหาร', description: 'รายการ'.repeat(30), date: `2025-${String(month + 1).padStart(2, '0')}-01`, amount: '12345.67' })));
  for (const width of [320, 360]) {
  await page.setViewportSize({ width, height: 800 });
  for (const path of ['/', '/pets', '/pets/1', '/health', '/expenses', '/care', '/reminders', '/upgrade', '/billing', '/settings']) {
    await page.goto(`${base}${path}`);
    await page.getByRole('button', { name: 'เปิดเมนู', exact: true }).click();
    await page.getByRole('button', { name: 'ปิดเมนู', exact: true }).click();
    await page.waitForTimeout(350);
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    expect(size.scroll, `overflow on ${path}`).toBeLessThanOrEqual(size.width + 1);
  }
  }
  await page.goto(`${base}/health`); await page.getByRole('button', { name: '+ เพิ่มบันทึก' }).click();
  await page.waitForTimeout(600);
  expect(await page.locator('#title').isVisible()).toBe(true);
  const cancel = page.getByRole('button', { name: 'ยกเลิก', exact: true });
  await cancel.scrollIntoViewIfNeeded();
  const buttonBox = await cancel.boundingBox();
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(800);
  await page.screenshot({ path: '../test-results/round2-mobile-health.png', fullPage: false });
  await cancel.click();
  await page.locator('#title').waitFor({ state: 'detached' });
});
it('Round 2: missing pet never displays another pet or crashes', async () => {
  await page.goto(`${base}/pets/999`); await page.getByText('ไม่พบสัตว์เลี้ยง', { exact: false }).first().waitFor();
  expect(await page.getByRole('button', { name: 'แก้ไข', exact: true }).count()).toBe(0);
});


it('Ads TC08: species targeting and all ad sets remain reachable on desktop and mobile', async () => {
  const [otherCat, dogCategory, otherDog] = await db.insert(petCategories).values([
    { species: 'แมว', breed: 'วิเชียรมาศ' }, { species: 'หมา', breed: 'พุดเดิ้ล' }, { species: 'หมา', breed: 'ชิบะ' }
  ]).returning();
  await db.update(pets).set({ petCategoryId: otherCat.id }).where(eq(pets.petId, 1));
  await db.insert(pets).values({ userId: session.user.id, petCategoryId: otherDog.id, name: 'โมจิ', gender: 'MALE', birthdate: '2025-09-12', weight: '7', color: 'น้ำตาล' });
  await db.update(careRecommends).set({ petCategoryId: otherCat.id }).where(eq(careRecommends.id, 1));
  await db.delete(ads);
  const products = await db.insert(ads).values(Array.from({ length: 7 }, (_, index) => ({
    petCategoryId: index < 3 ? 1 : index < 5 ? dogCategory.id : null,
    location: 'ALL', title: `อาหารวัคซีน ${index + 1}`, content: `สินค้าแนะนำ ${index + 1}`, targetUrl: `https://example.com/product/${index + 1}`
  }))).returning();
  const allLinks = products.map(product => `/products/${product.id}`).sort();
  const catLinks = products.filter(product => product.petCategoryId !== dogCategory.id).map(product => `/products/${product.id}`).sort();
  async function checkSets(region: any, expected: string[]) {
    await region.getByRole('link').first().waitFor();
    // Let responsive container measurements settle before paging.
    await page.waitForTimeout(600);
    const seen: string[] = [];
    const first = await region.getByRole('link').first().getAttribute('href');
    const next = region.getByRole('button', { name: 'โฆษณาชุดถัดไป', exact: true });
    const previous = region.getByRole('button', { name: 'โฆษณาชุดก่อนหน้า', exact: true });
    expect(await previous.isDisabled()).toBe(true);
    for (let set = 0; set < expected.length; set++) {
      const links = await region.getByRole('link').evaluateAll((anchors: HTMLAnchorElement[]) => anchors.map(a => a.getAttribute('href')));
      expect(links.length).toBeLessThanOrEqual(3);
      seen.push(...links);
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(seen.sort()).toEqual(expected);
    expect(await next.isDisabled()).toBe(true);
    while (!await previous.isDisabled()) await previous.click();
    expect(await region.getByRole('link').first().getAttribute('href')).toBe(first);
  }
  await page.goto(`${base}/`);
  await checkSets(page.getByRole('region', { name: 'โฆษณาแนะนำ', exact: true }), allLinks);
  await page.goto(`${base}/reminders`);
  await checkSets(page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true }), allLinks);
  // A changed pet filter resets paging and never retains another species' ads.
  await page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true }).getByRole('button', { name: 'โฆษณาชุดถัดไป', exact: true }).click();
  await page.getByRole('combobox').first().selectOption('ไข่ตุ๋น');
  await checkSets(page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true }), catLinks);
  await db.insert(activities).values({ petId: 1, entryType: 'REMINDER', activityType: 'วัคซีน', title: 'วัคซีนทดสอบโฆษณา', activityDate: '2099-01-01', scheduledAt: new Date('2099-01-01T00:00:00Z') });
  await page.reload();
  await page.getByRole('button', { name: 'รายละเอียด', exact: true }).click();
  await checkSets(page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true }).last(), catLinks);
  await page.getByRole('button', { name: 'ปิด', exact: true }).click();
  await page.goto(`${base}/care`);
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click();
  await page.getByRole('heading', { name: 'อาหารแมว', exact: true }).click();
  await checkSets(page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true }), catLinks);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${base}/reminders`);
  const mobileAds = page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true });
  await checkSets(mobileAds, allLinks);
  expect(await mobileAds.getByRole('link').count()).toBe(1);
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
  await page.screenshot({ path: '../test-results/ads-pagination-mobile.png', fullPage: true });
});

it('Ads autoplay: dashboard, reminders and care advance automatically, pause and wrap', async () => {
  await db.insert(ads).values(Array.from({ length: 5 }, (_, index) => ({
    petCategoryId: 1, location: 'ALL', title: `อาหารเพิ่มเติม ${index}`, content: 'อาหารแมว', targetUrl: 'https://example.com/food'
  })));
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  for (const path of ['/', '/reminders', '/care']) {
    await page.goto(`${base}${path}`);
    if (path === '/care') {
      await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click();
      await page.getByRole('heading', { name: 'อาหารแมว', exact: true }).click();
    }
    const region = page.getByRole('region', { name: path === '/' ? 'โฆษณาแนะนำ' : 'สินค้าแนะนำ', exact: true });
    await region.getByRole('link').first().waitFor();
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.clock.runFor(700);
    const first = await region.getByRole('link').first().getAttribute('href');
    await page.clock.runFor(5100);
    expect(await region.getByRole('link').first().getAttribute('href')).not.toBe(first);
    const pause = region.getByRole('button', { name: 'หยุดเลื่อนอัตโนมัติ', exact: true });
    await pause.click();
    const held = await region.getByRole('link').first().getAttribute('href');
    await page.mouse.move(0, 0); await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.clock.runFor(5500);
    expect(await region.getByRole('link').first().getAttribute('href')).toBe(held);
    await region.getByRole('button', { name: 'เริ่มเลื่อนอัตโนมัติ', exact: true }).click();
    const next = region.getByRole('button', { name: 'โฆษณาชุดถัดไป', exact: true });
    while (!await next.isDisabled()) await next.click();
    await page.mouse.move(0, 0); await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.clock.runFor(5100);
    expect(await region.getByRole('link').first().getAttribute('href')).toBe(first);
  }
  // Visible controls for a single set explain why it cannot advance.
  await db.delete(ads);
  await db.insert(ads).values({ location: 'ALL', content: 'รายการเดียว' });
  await page.goto(`${base}/reminders`);
  const region = page.getByRole('region', { name: 'สินค้าแนะนำ', exact: true });
  await region.getByText('แสดงโฆษณาครบแล้วในชุดนี้').waitFor();
  expect(await region.getByRole('button', { name: 'โฆษณาชุดถัดไป', exact: true }).isDisabled()).toBe(true);
});

it('Admin recommendation form: new species recommendation appears for a user with another breed', async () => {
  const [category] = await db.insert(petCategories).values({ species: 'แมว', breed: 'วิเชียรมาศ' }).returning();
  await db.update(pets).set({ petCategoryId: category.id }).where(eq(pets.petId, 1));
  const [admin] = await db.insert(users).values({ username: 'Admin', email: 'admin-create@example.test', passwordHash, role: 'ADMIN' }).returning();
  await page.goto(`${base}/care`);
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click();
  const context = await browser.newContext();
  try {
    await context.addInitScript((auth: any) => {
      localStorage.setItem('hhm_token', auth.token); localStorage.setItem('hhm_user', JSON.stringify(auth.user));
    }, { token: signToken(admin as any), user: publicUser(admin as any) });
    const adminPage = await context.newPage();
    await adminPage.goto(`${base}/admin/recommendations`);
    await adminPage.getByRole('button', { name: '+ เพิ่มคำแนะนำ', exact: true }).click();
    await adminPage.locator('form select').first().selectOption('1');
    await adminPage.locator('form select').nth(1).selectOption('ALL');
    await adminPage.getByPlaceholder('เช่น วิธีดูแลลูกแมวแรกเกิด').fill('คำแนะนำสร้างใหม่จากแอดมิน');
    await adminPage.locator('form textarea').fill('คำแนะนำแมวทุกสายพันธุ์');
    await adminPage.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await adminPage.getByRole('cell').filter({ hasText: 'คำแนะนำสร้างใหม่จากแอดมิน' }).first().waitFor();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading', { name: 'คำแนะนำสร้างใหม่จากแอดมิน', exact: true }).waitFor();
    expect(await page.getByRole('button').filter({ hasText: 'คำแนะนำ (2)' }).count()).toBe(1);
  } finally { await context.close(); }
});

it('Care grouping: all pets share one recommendation card while individual filters stay separate', async () => {
  const [dogCategory] = await db.insert(petCategories).values({ species: 'หมา', breed: 'ชิบะ' }).returning();
  const [dog] = await db.insert(pets).values({ userId: session.user.id, petCategoryId: dogCategory.id, name: 'โมจิ', gender: 'MALE', birthdate: '2025-09-12', weight: '7', color: 'น้ำตาล', allergies: 'ไก่', notes: 'ชอบเดินเล่น' }).returning();
  await db.update(careRecommends).set({ petCategoryId: null, ageRange: 'ALL', title: 'คำแนะนำร่วม', content: 'คำแนะนำสำหรับสัตว์เลี้ยงทั้งสองประเภท' }).where(eq(careRecommends.id, 1));
  // Different recommendation records must remain separate even with the same title.
  await db.insert(careRecommends).values([
    { petCategoryId: 1, ageRange: 'ALL', title: 'คำแนะนำเฉพาะประเภท', content: 'สำหรับแมว' },
    { petCategoryId: dogCategory.id, ageRange: 'ALL', title: 'คำแนะนำเฉพาะประเภท', content: 'สำหรับหมา' }
  ]);
  await page.goto(`${base}/care`);
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (3)' }).click();
  const cards = page.locator('[data-recommendation-id]');
  const shared = page.locator('[data-recommendation-id="1"]');
  expect(await cards.count()).toBe(3);
  expect(await shared.count()).toBe(1);
  expect(await shared.innerText()).toContain('ไข่ตุ๋น');
  expect(await shared.innerText()).toContain('โมจิ');
  expect(await page.getByRole('heading', { name: 'คำแนะนำเฉพาะประเภท', exact: true }).count()).toBe(2);
  await shared.click();
  await page.getByRole('heading', { name: 'คำแนะนำร่วม', level: 2, exact: true }).waitFor();
  await page.getByText('ข้อมูลการแพ้ของ ไข่ตุ๋น: วัคซีนลูคีเมีย', { exact: true }).waitFor();
  await page.getByText('ข้อมูลการแพ้ของ โมจิ: ไก่', { exact: true }).waitFor();
  await page.getByText('หมายเหตุของ โมจิ: ชอบเดินเล่น', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'ปิด', exact: true }).click();
  const filter = page.getByLabel('กรองตามสัตว์เลี้ยง');
  await filter.selectOption(String(dog.petId));
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (2)' }).waitFor();
  expect(await cards.count()).toBe(2);
  expect(await shared.innerText()).toContain('โมจิ');
  expect(await shared.innerText()).not.toContain('ไข่ตุ๋น');
  await filter.selectOption('1');
  expect(await cards.count()).toBe(2);
  expect(await shared.innerText()).toContain('ไข่ตุ๋น');
  expect(await shared.innerText()).not.toContain('โมจิ');
  await filter.selectOption('');
  expect(await cards.count()).toBe(3);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '../test-results/care-grouped-recommendations.png', fullPage: true });
  // Names can be identical: filtering still uses the pet ID.
  await db.update(pets).set({ name: 'ไข่ตุ๋น' }).where(eq(pets.petId, dog.petId));
  await page.reload();
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (3)' }).click();
  await filter.selectOption(String(dog.petId));
  expect(await cards.count()).toBe(2);
  expect(await page.locator('[data-recommendation-id="2"]').count()).toBe(0);
  expect(await page.locator('[data-recommendation-id="3"]').innerText()).toContain('สำหรับหมา');
});

it('Care images: base64 pet photos render as images in plans, recommendations and details', async () => {
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ff5577'; ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/jpeg');
  });
  await db.update(pets).set({ avatarUrl: photo }).where(eq(pets.petId, 1));
  await db.insert(carePlans).values({ petId: 1, title: 'แผนพร้อมรูป', detail: 'แปรงขน', frequencyDays: 1 });
  const [admin] = await db.insert(users).values({ username: 'Admin', email: 'admin-image@example.test', passwordHash, role: 'ADMIN' }).returning();
  const result = await app.request('/api/admin/recommendations', {
    method: 'POST', headers: { Authorization: `Bearer ${signToken(admin as any)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ petCategoryId: null, ageRange: 'ALL', title: 'คำแนะนำพร้อมรูป', content: 'คำแนะนำใหม่', imageUrl: photo })
  });
  expect(result.status).toBe(201);
  await page.goto(`${base}/care`);
  await page.getByRole('heading', { name: 'แผนพร้อมรูป', exact: true }).waitFor();
  const avatar = page.getByRole('img', { name: 'รูปของ ไข่ตุ๋น', exact: true });
  await avatar.waitFor();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('img[alt="รูปของ ไข่ตุ๋น"]')).every(img => (img as HTMLImageElement).naturalWidth > 0));
  expect(await page.locator('body').innerText()).not.toContain('data:image');
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (2)' }).click();
  expect(await avatar.count()).toBe(2);
  await page.getByRole('img', { name: 'คำแนะนำพร้อมรูป', exact: true }).waitFor();
  expect(await page.locator('body').innerText()).not.toContain('data:image');
  await page.getByRole('heading', { name: 'คำแนะนำพร้อมรูป', exact: true }).click();
  await page.getByRole('heading', { name: 'คำแนะนำพร้อมรูป', exact: true, level: 2 }).waitFor();
  expect(await avatar.count()).toBe(3);
  expect(await page.locator('body').innerText()).not.toContain('data:image');
  await page.getByRole('button', { name: 'ปิด', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '../test-results/care-base64-photo.png', fullPage: true });
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
});

it('Deleted recommendation closes stale detail when user returns to the page', async () => {
  const [admin] = await db.insert(users).values({ username: 'Admin', email: 'admin-delete@example.test', passwordHash, role: 'ADMIN' }).returning();
  await page.goto(`${base}/care`);
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click();
  await page.getByRole('heading', { name: 'อาหารแมว', exact: true }).click();
  await page.getByRole('heading', { name: 'อาหารแมว', exact: true, level: 2 }).waitFor();
  const result = await app.request('/api/admin/recommendations/1', { method: 'DELETE', headers: { Authorization: `Bearer ${signToken(admin as any)}` } });
  expect(result.status).toBe(204);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (0)' }).waitFor();
  expect(await page.getByRole('heading', { name: 'อาหารแมว', exact: true }).count()).toBe(0);
  await page.reload(); await page.getByRole('button').filter({ hasText: 'คำแนะนำ (0)' }).waitFor();
});

it('Deleted recommendation is not restored by an older delayed response', async () => {
  const [admin] = await db.insert(users).values({ username: 'Admin', email: 'admin-race@example.test', passwordHash, role: 'ADMIN' }).returning();
  await page.goto(`${base}/care`);
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click();
  let announceOld: () => void = () => {}; let releaseOld: () => void = () => {};
  const oldReady = new Promise<void>(resolve => announceOld = resolve);
  const oldReleased = new Promise<void>(resolve => releaseOld = resolve);
  let intercepted = false;
  await page.route('**/api/care-recommendations', async (route: any) => {
    if (intercepted) { await route.continue(); return; }
    intercepted = true;
    const response = await route.fetch();
    announceOld();
    await oldReleased;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await oldReady;
  const result = await app.request('/api/admin/recommendations/1', { method: 'DELETE', headers: { Authorization: `Bearer ${signToken(admin as any)}` } });
  expect(result.status).toBe(204);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (0)' }).waitFor();
  const oldResponse = page.waitForResponse('**/api/care-recommendations');
  releaseOld(); await oldResponse;
  await page.waitForTimeout(300);
  expect(await page.getByRole('button').filter({ hasText: 'คำแนะนำ (0)' }).count()).toBe(1);
  expect(await page.getByRole('heading', { name: 'อาหารแมว', exact: true }).count()).toBe(0);
});

const responsiveRoutes = ['/', '/pets', '/pets/1', '/health', '/expenses', '/care', '/reminders', '/upgrade', '/billing', '/billing/verify?ref=RESPONSIVE', '/settings', '/products/1', '/admin', '/admin/users', '/admin/ads', '/admin/recommendations', '/login', '/register', '/reset-password'];
async function seedResponsiveData() {
  const [admin] = await db.update(users).set({ role: 'ADMIN', username: 'ชื่อผู้ใช้สำหรับตรวจการแสดงผลบนหน้าจอขนาดเล็ก', email: 'responsive-long-email-address@example.test' }).where(eq(users.id, 1)).returning();
  await page.context().addInitScript((user: any) => localStorage.setItem('hhm_user', JSON.stringify(user)), publicUser(admin as any));
  await db.update(pets).set({ name: 'น้องแมวชื่อยาวสำหรับทดสอบหน้าจอมือถือ', notes: 'รายละเอียดที่ต้องอ่านได้แม้หน้าจอเล็ก '.repeat(10) });
  await db.insert(activities).values([
    { petId: 1, entryType: 'HEALTH_RECORD', activityType: 'ตรวจสุขภาพ', title: 'ตรวจสุขภาพประจำปี', detail: 'รายละเอียดสุขภาพ '.repeat(20), activityDate: '2026-01-01', cost: '123456.78' },
    { petId: 1, entryType: 'REMINDER', activityType: 'วัคซีน', title: 'นัดฉีดวัคซีนประจำปี', activityDate: '2099-01-01', scheduledAt: new Date('2099-01-01T09:00:00+07:00'), reminderMinutes: 30 }
  ]);
  await db.insert(expenses).values(Array.from({ length: 12 }, (_, i) => ({ petId: 1, category: 'อาหาร', date: `2025-${String(i + 1).padStart(2, '0')}-01`, amount: '123456.78', description: 'อาหารสำหรับสัตว์เลี้ยง '.repeat(10) })));
  await db.insert(carePlans).values({ petId: 1, title: 'แผนดูแลสัตว์เลี้ยงประจำเดือน', detail: 'รายละเอียดการดูแล '.repeat(10), frequencyDays: 30, nextDueAt: new Date('2099-01-01') });
  await db.insert(payments).values({ userId: 1, amount: '39', status: 'SUCCESS', provider: 'DEMO_CREDIT', reference: 'RESPONSIVE', periodEnd: new Date('2099-01-01') });
}
async function checkPageWidth() {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const overflow = Array.from(document.querySelectorAll<HTMLElement>('main *')).filter(el => {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || (box.left >= -1 && box.right <= width + 1)) return false;
      let parent: HTMLElement | null = el;
      while (parent && parent.tagName !== 'MAIN') {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) return false;
        parent = parent.parentElement;
      }
      return true;
    }).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 60) }));
    return { width: document.documentElement.scrollWidth, viewport: width, overflow: overflow.slice(0, 8) };
  });
}
it.each([[320, 568], [390, 844], [667, 375], [768, 1024], [1024, 768], [1440, 900]])('Responsive all pages at %s x %s', async (width, height) => {
  await seedResponsiveData(); await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' });
  const results: any[] = [];
  for (const route of responsiveRoutes) {
    await page.goto(base + route, { waitUntil: 'networkidle' }); await page.locator('main').waitFor();
    expect(new URL(page.url()).pathname).toBe(route.split('?')[0]);
    results.push({ route, ...await checkPageWidth() });
    if ([390, 1440].includes(width)) await page.screenshot({ path: `../test-results/responsive-${width}-${route.split('?')[0].replaceAll('/', '_')}.png`, fullPage: true });
    for (const region of await page.locator('.table-scroll').all()) {
      const metrics = await region.evaluate((el: HTMLElement) => { el.scrollLeft = el.scrollWidth; return { scroll: el.scrollLeft, width: el.clientWidth, content: el.scrollWidth }; });
      if (metrics.content > metrics.width + 1) expect(metrics.scroll).toBeGreaterThan(0);
    }
  }
  await writeFile(`../test-results/responsive-${width}.json`, JSON.stringify(results, null, 2));
  expect(results.filter(row => row.width > row.viewport + 1 || row.overflow.length)).toEqual([]);
}, 180000);
it.each([[320, 480], [667, 320]])('Responsive dialogs and mobile navigation at %s x %s', async (width, height) => {
  await seedResponsiveData(); await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/'); await page.getByRole('button', { name: 'เปิดเมนู', exact: true }).click();
  await page.getByRole('button', { name: 'ปิดเมนูด้านข้าง' }).waitFor();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.getByRole('link', { name: 'จัดการคำแนะนำ', exact: true }).click(); await page.waitForURL('**/admin/recommendations');
  expect(await page.locator('aside[inert]').count()).toBe(1);
  const dialogs = [['/pets', 'เพิ่มสัตว์เลี้ยง'], ['/pets/1', 'แก้ไข'], ['/health', '+ เพิ่มบันทึก'], ['/expenses', '+ เพิ่มรายจ่าย'], ['/care', '+ สร้างแผนดูแล'], ['/reminders', 'เลื่อน'], ['/settings', 'ลบบัญชีถาวร'], ['/admin/users', 'แก้ไข'], ['/admin/ads', '+ เพิ่มโฆษณา'], ['/admin/recommendations', '+ เพิ่มคำแนะนำ'], ['/upgrade', 'อัปเกรดด้วยการชำระเงินจำลอง']];
  for (const [route, name] of dialogs) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    const button = page.getByRole('button', { name, exact: true }).first(); await button.scrollIntoViewIfNeeded(); await button.click();
    const modal = page.locator('body > .responsive-modal').last(); await modal.waitFor(); const box = await modal.boundingBox();
    expect(Math.abs(box.x)).toBeLessThanOrEqual(1); expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
    expect(box.width).toBeLessThanOrEqual(width); expect(box.height).toBeLessThanOrEqual(height);
    const last = modal.getByRole('button').last(); await last.scrollIntoViewIfNeeded(); const lastBox = await last.boundingBox();
    expect(lastBox.x).toBeGreaterThanOrEqual(0); expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(width + 1);
    expect(lastBox.y).toBeGreaterThanOrEqual(0); expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(height + 1);
    await last.click({ trial: true }); expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.screenshot({ path: `../test-results/responsive-dialog-${width}-${route.replaceAll('/', '_')}.png` });
  }
}, 180000);

it('Responsive secondary tabs and recommendation popup fit a phone', async () => {
  await seedResponsiveData(); await page.setViewportSize({ width: 320, height: 480 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/pets/1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'บันทึกสุขภาพ', exact: true }).click();
  expect((await checkPageWidth()).width).toBeLessThanOrEqual(321);
  await page.getByRole('button', { name: '+ เพิ่มบันทึกสุขภาพ', exact: true }).click();
  const form = page.locator('body > .responsive-modal'); await form.waitFor();
  await form.getByRole('button').last().click({ trial: true });
  await page.goto(base + '/care', { waitUntil: 'networkidle' });
  await page.getByRole('button').filter({ hasText: 'คำแนะนำ (1)' }).click();
  await page.locator('[data-recommendation-id="1"]').click();
  const detail = page.locator('body > .responsive-modal'); await detail.waitFor();
  await detail.getByRole('button', { name: 'ปิด', exact: true }).click();
  expect(await page.locator('body > .responsive-modal').count()).toBe(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect((await checkPageWidth()).width).toBeLessThanOrEqual(321);
});

it('Responsive Google login button follows its container width', async () => {
  await page.context().addInitScript(() => {
    (window as any).google = { accounts: { id: { initialize() {}, renderButton(container: HTMLElement, options: any) {
      const button = document.createElement('button'); button.textContent = 'Google test button'; button.style.width = options.width + 'px'; button.dataset.googleTest = 'true'; container.append(button);
    } } } };
  });
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto(base + '/login', { waitUntil: 'networkidle' });
  const button = page.locator('[data-google-test]'); await button.waitFor();
  const phone = await button.boundingBox(); expect(phone.x + phone.width).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => (document.querySelector('[data-google-test]') as HTMLElement)?.offsetWidth === 320);
  expect(await button.count()).toBe(1);
});
