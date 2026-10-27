import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
vi.hoisted(() => { process.env.PAYMENT_WEBHOOK_SECRET = 'isolated-test-webhook-secret'; process.env.PAYMENT_CHECKOUT_URL = ''; });
vi.mock('../src/db/index.js', async () => await import('./test-db.js'));
vi.mock('../src/utils/product-link.js', () => ({ availableProductLink: vi.fn(async () => true) }));
import { app } from '../src/app.js';
import { client, db, initialize } from './test-db.js';
import { users, pets, petCategories, ads, careRecommends, activities, expenses, payments, carePlans } from '../src/db/schema.js';
import { signToken } from '../src/utils/auth.js';
import { availableProductLink } from '../src/utils/product-link.js';

const fullPet = { name: 'ไข่ตุ๋น', species: 'แมว', breed: 'เปอร์เซียร์', gender: 'FEMALE', birthdate: '2025-09-12', weight: 4.75, color: 'ขาว', allergies: 'วัคซีนลูคีเมีย', notes: 'ชอบกินกุ้งมากก' };
const reminder = { petId: 1, type: 'วัคซีน', title: 'การฉีดวัคซีน', scheduledAt: '2026-10-25T09:00:00+07:00', reminderMinutes: 0, recurrenceDays: null };
const expense = { petId: 1, category: 'อาหาร', description: 'ขนมสุนัข', date: '2026-06-17', amount: 12345 };
let token: string;
let otherToken: string;
async function call(path: string, method = 'GET', body?: unknown, auth = token) {
  const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}

beforeAll(async () => { await initialize(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-17T05:00:00Z')); });
afterAll(async () => { vi.useRealTimers(); await client.close(); });
beforeEach(async () => {
  vi.setSystemTime(new Date("2026-10-17T05:00:00Z"));
  await client.exec('TRUNCATE "user", pet_category, ads, care_recommend RESTART IDENTITY CASCADE');
  const [user, other] = await db.insert(users).values([{ username: 'Acceptance', email: 'acceptance@example.test', passwordHash: '!test!' }, { username: 'Other', email: 'other@example.test', passwordHash: '!test!' }]).returning();
  token = signToken(user as any); otherToken = signToken(other as any);
  await db.insert(petCategories).values([{ species: 'แมว', breed: 'เปอร์เซียร์' }, { species: 'หมา', breed: 'พุดเดิ้ล' }, { species: 'แมว', breed: null }]);
  await db.insert(pets).values({ userId: user.id, petCategoryId: 1, name: fullPet.name, gender: 'FEMALE', birthdate: fullPet.birthdate, weight: '4.75', color: fullPet.color, allergies: fullPet.allergies, notes: fullPet.notes });
  await db.insert(careRecommends).values([
    { petCategoryId: 1, ageRange: 'ADULT', title: 'อาหารแมว', content: 'ข้อมูลอาหารสำหรับแมววัยโต' },
    { petCategoryId: 1, ageRange: 'BABY', title: 'ลูกแมว', content: 'ข้อมูลสำหรับลูกแมว' },
    { petCategoryId: 2, ageRange: 'ALL', title: 'สุนัข', content: 'ข้อมูลสุนัข' }
  ]);
  await db.insert(ads).values([{ petCategoryId: 1, location: 'ALL', title: 'อาหารแมว', content: 'อาหารแมวสำหรับไข่ตุ๋น', targetUrl: 'https://example.com/cat-food' }, { petCategoryId: 2, location: 'ALL', title: 'อาหารสุนัข', content: 'อาหารสุนัข', targetUrl: 'https://example.com/dog-food' }]);
  vi.mocked(availableProductLink).mockResolvedValue(true);
});

describe('Pet Profile Management: workbook TC01–TC15', () => {
  const cases: Array<[string, Record<string, unknown>, number]> = [
    ['TC01 valid name', {}, 201], ['TC02 symbols', { name: '&^&' }, 400], ['TC03 blank name', { name: '' }, 400],
    ['TC04 valid birthdate', {}, 201], ['TC05 future birthdate', { birthdate: '2027-09-12' }, 400], ['TC06 missing birthdate', { birthdate: '' }, 400],
    ['TC07 valid weight', {}, 201], ['TC08 negative weight', { weight: -0.05 }, 400], ['TC09 missing weight', { weight: '' }, 400],
    ['TC10 valid breed/color', {}, 201], ['TC11 invalid breed/color', { breed: 'เปอร์เซียร์ ^>^', color: 'ขาว ^>^' }, 400],
    ['TC12 optional breed/color', { breed: '', color: '' }, 201], ['TC13 valid notes', {}, 201], ['TC14 long notes', { notes: 'ก'.repeat(501) }, 400], ['TC15 optional allergies/notes', { allergies: '', notes: '' }, 201]
  ];
  it.each(cases)('%s', async (_id, change, status) => {
    const result = await call('/api/pets', 'POST', { ...fullPet, ...change }); expect(result.status).toBe(status);
    const rows = (await call('/api/pets')).body.pets; expect(rows).toHaveLength(status === 201 ? 2 : 1);
    if (status === 201) expect(rows[0].name).toBe(fullPet.name);
  });
});

describe('Reminder Management: workbook TC01–TC09', () => {
  it('TC01 create and persist with local timezone', async () => { expect((await call('/api/reminders', 'POST', reminder)).status).toBe(201); const rows = (await call('/api/reminders')).body.reminders; expect(rows[0].scheduledAt).toBe('2026-10-25T02:00:00.000Z'); });
  it('TC02 blank title', async () => { expect((await call('/api/reminders', 'POST', { ...reminder, title: '  ' })).status).toBe(400); });
  it('TC03 past create', async () => { expect((await call('/api/reminders', 'POST', { ...reminder, scheduledAt: '2026-09-25T09:00:00+07:00' })).status).toBe(400); expect((await call('/api/reminders')).body.reminders).toHaveLength(0); });
  it('TC04 snooze and retain status', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1/snooze', 'POST', { scheduledAt: '2026-10-30T11:00:00+07:00' })).status).toBe(200); const row = (await call('/api/reminders')).body.reminders[0]; expect(row.snoozedUntil).toBe('2026-10-30T04:00:00.000Z'); });
  it('TC05 empty snooze', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1/snooze', 'POST', { scheduledAt: '' })).status).toBe(400); });
  it('TC06 past snooze', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1/snooze', 'POST', { scheduledAt: '2026-09-25T09:00:00+07:00' })).status).toBe(400); expect((await call('/api/reminders')).body.reminders[0].scheduledAt).toBe('2026-10-25T02:00:00.000Z'); });
  it('TC07 edit and persist', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1', 'PATCH', { title: 'การฉีดวัคซีนกระตุ้นเข็ม 2', scheduledAt: '2026-10-30T11:00:00+07:00' })).status).toBe(200); const row = (await call('/api/reminders')).body.reminders[0]; expect(row.title).toBe('การฉีดวัคซีนกระตุ้นเข็ม 2'); expect(row.scheduledAt).toBe('2026-10-30T04:00:00.000Z'); });
  it('TC08 blank edited title', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1', 'PATCH', { title: '' })).status).toBe(400); expect((await call('/api/reminders')).body.reminders[0].title).toBe(reminder.title); });
  it('TC09 past edited date', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1', 'PATCH', { scheduledAt: '2026-10-15T11:00:00+07:00' })).status).toBe(400); });
});

describe('Care Recommendation & Ad: workbook TC01–TC12', () => {
  it('TC01 match profile, species and age', async () => { const result = await call('/api/care-recommendations'); expect(result.body.recommendations.map((r: any) => r.title)).toEqual(['อาหารแมว']); expect(result.body.recommendations[0].allergies).toBe(fullPet.allergies); });
  it('TC02 incomplete legacy profile', async () => { await db.update(pets).set({ birthdate: null }).where(eq(pets.petId, 1)); const result = await call('/api/care-recommendations'); expect(result.body.recommendations).toHaveLength(0); expect(result.body.warnings[0].message).toContain('สายพันธุ์และอายุ'); });
  it('TC03 invalid legacy profile', async () => { await db.update(pets).set({ birthdate: '2077-09-12', weight: '-4.75' }).where(eq(pets.petId, 1)); const result = await call('/api/care-recommendations'); expect(result.body.recommendations).toHaveLength(0); expect(result.body.warnings[0].message).toContain('แก้ไขข้อมูลโปรไฟล์'); });
  it('TC04 create plan using worksheet steps and display persisted schedule', async () => { const result = await call('/api/care-plans', 'POST', { petId: 1, title: 'ข้อควรระวังและแผนการดูแลน้องไข่ตุ๋น', detail: 'ข้อมูลการแพ้: วัคซีนลูคีเมีย\nแปรงขน', frequencyDays: 1, nextDueAt: '2026-09-17' }); expect(result.status).toBe(201); const rows = (await call('/api/care-plans')).body.plans; expect(rows[0].frequencyDays).toBe(1); expect(rows[0].petName).toBe(fullPet.name); });
  it('TC05 no pets cannot create plan', async () => { await db.delete(pets); expect((await call('/api/care-plans', 'POST', { petId: 1, title: 'แผนดูแล' })).status).toBe(404); expect((await call('/api/care-recommendations')).body.warnings[0].code).toBe('NO_PETS'); });
  it('TC06 unsupported species', async () => { const [cat] = await db.insert(petCategories).values({ species: 'กิ้งก่า', breed: 'กิ้งก่า' }).returning(); await db.update(pets).set({ petCategoryId: cat.id }).where(eq(pets.petId, 1)); const result = await call('/api/care-recommendations'); expect(result.body.recommendations).toHaveLength(0); expect(result.body.warnings[0].code).toBe('NO_STANDARD_PLAN'); });
  it('TC07 homepage ads', async () => { expect((await call('/api/ads?location=HOME')).body.ads[0].title).toBe('อาหารแมว'); });
  it('TC08 species relevant ads exclude unowned species', async () => { await db.insert(ads).values({ petCategoryId: 2, location: 'ALL', content: 'สุนัข' }); expect((await call('/api/ads')).body.ads).toHaveLength(1); });
  it('TC09 reminder ads', async () => { expect((await call('/api/ads?location=REMINDERS&petId=1')).body.ads).toHaveLength(1); });
  it('TC10 related product and checkout link', async () => { expect((await call('/api/ads?location=CARE&petId=1&topic=อาหาร')).body.ads).toHaveLength(1); expect((await call('/api/products/1')).status).toBe(200); expect((await call('/api/products/1/checkout', 'POST')).body.url).toBe('https://example.com/cat-food'); });
  it('TC11 deleted and unavailable product', async () => { vi.mocked(availableProductLink).mockResolvedValue(false); expect((await call('/api/products/1/checkout', 'POST')).status).toBe(410); await db.delete(ads).where(eq(ads.id, 1)); expect((await call('/api/products/1')).status).toBe(404); });
  it('TC12 anonymous and expired sessions cannot checkout', async () => { expect((await call('/api/products/1/checkout', 'POST', undefined, '')).status).toBe(401); vi.setSystemTime(new Date('2026-10-25T05:00:00Z')); expect((await call('/api/products/1/checkout', 'POST')).status).toBe(401); vi.setSystemTime(new Date('2026-10-17T05:00:00Z')); });
});

describe('Expense Management: workbook TC01–TC15', () => {
  const cases: Array<[string, Record<string, unknown>, number]> = [
    ['TC01 complete description', {}, 201], ['TC02 missing description', { description: '' }, 400], ['TC03 symbols', { description: '@#$@%#' }, 400],
    ['TC04 valid day', {}, 201], ['TC05 missing day', { date: '2026-06-' }, 400], ['TC06 invalid day', { date: '2026-06-39' }, 400],
    ['TC07 valid month', {}, 201], ['TC08 missing month', { date: '2026--17' }, 400], ['TC09 invalid month', { date: '2026-15-17' }, 400],
    ['TC10 valid year', {}, 201], ['TC11 missing year', { date: '-06-17' }, 400], ['TC12 invalid future year', { date: '89431-06-17' }, 400],
    ['TC13 valid amount', {}, 201], ['TC14 missing amount (actual result/required field)', { amount: '' }, 400], ['TC15 malformed amount', { amount: '123--45' }, 400]
  ];
  it.each(cases)('%s', async (_id, change, status) => { const result = await call('/api/expenses', 'POST', { ...expense, ...change }); expect(result.status).toBe(status); const rows = (await call('/api/expenses')).body.expenses; expect(rows).toHaveLength(status === 201 ? 1 : 0); if (status === 201) expect((await call('/api/dashboard')).body.byCategory[0].amount).toBe(expense.amount); });
});

describe('Regression boundaries', () => {
  it('reject zero weight, impossible dates and excessive allergy text on edit', async () => { for (const change of [{ weight: 0 }, { birthdate: '2026-02-30' }, { allergies: 'ก'.repeat(501) }, { name: '   ' }]) expect((await call('/api/pets/1', 'PATCH', change)).status).toBe(400); });
  it('reject same-day past reminder and invalid timestamp', async () => { for (const scheduledAt of ['2026-10-17T11:59:00+07:00', '2026-02-30T12:00:00Z', 'not-a-date']) expect((await call('/api/reminders', 'POST', { ...reminder, scheduledAt })).status).toBe(400); });
  it('protect other owners from edits and snoozing', async () => { await call('/api/reminders', 'POST', reminder); expect((await call('/api/reminders/1', 'PATCH', { title: 'changed' }, otherToken)).status).toBe(404); expect((await call('/api/reminders/1/snooze', 'POST', { scheduledAt: reminder.scheduledAt }, otherToken)).status).toBe(404); });
  it('clear snooze and recurrence on edit', async () => { await call('/api/reminders', 'POST', { ...reminder, recurrenceDays: 7 }); await call('/api/reminders/1/snooze', 'POST', { scheduledAt: reminder.scheduledAt }); await call('/api/reminders/1', 'PATCH', { recurrenceDays: null, scheduledAt: '2026-10-30T11:00:00+07:00' }); const row = (await call('/api/reminders')).body.reminders[0]; expect(row.snoozedUntil).toBeNull(); expect(row.recurrenceDays).toBeNull(); });
  it('premium users see no ads', async () => { await db.update(users).set({ planType: 'PREMIUM' }).where(eq(users.id, 1)); expect((await call('/api/ads')).body.ads).toHaveLength(0); });
  it('migrations can be run again without duplicate schema errors', async () => { await initialize(); expect((await call('/api/pets')).status).toBe(200); });
});


describe('Round 2: membership and payment (FR01.4/FR01.6)', () => {
  async function downgrade() {
    await db.update(users).set({ planType: 'PREMIUM' }).where(eq(users.id, 1));
    for (let i = 0; i < 3; i++) expect((await call('/api/pets', 'POST', { ...fullPet, name: `Pet ${i}` })).status).toBe(201);
    expect((await call('/api/billing/cancel', 'POST')).status).toBe(200);
  }
  it('downgrade preserves all pets but marks only oldest three editable', async () => {
    await downgrade();
    const rows = (await call('/api/pets')).body.pets;
    expect(rows).toHaveLength(4); expect(rows.filter((p: any) => p.readOnly).map((p: any) => p.id)).toEqual([4]);
    expect((await call('/api/pets/4')).body.pet.readOnly).toBe(true);
    expect((await call('/api/pets/1', 'PATCH', { name: 'Editable' })).status).toBe(200);
    expect((await call('/api/pets', 'POST', fullPet)).status).toBe(403);
  });
  it.each([
    ['/api/pets/4', 'PATCH', { name: 'Locked' }], ['/api/pets/4', 'DELETE', undefined],
    ['/api/health-records', 'POST', { petId: 4, type: 'วัคซีน', title: 'Locked', date: '2026-10-10' }],
    ['/api/reminders', 'POST', { ...reminder, petId: 4 }],
    ['/api/expenses', 'POST', { ...expense, petId: 4 }], ['/api/care-plans', 'POST', { petId: 4, title: 'Locked' }]
  ])('locked pet rejects %s %s', async (path, method, body) => { await downgrade(); const r = await call(path, method, body); expect(r.status).toBe(403); expect(r.body.code).toBe('PET_PLAN_LIMIT'); });
  it('cannot mutate existing records of a locked pet or move records there', async () => {
    await downgrade();
    const [record] = await db.insert(activities).values({ petId: 4, entryType: 'HEALTH_RECORD', activityType: 'checkup', title: 'Locked', activityDate: '2026-10-10' }).returning();
    expect((await call(`/api/health-records/${record.id}`, 'PATCH', { title: 'No' })).status).toBe(403);
    expect((await call(`/api/expenses/hr-${record.id}`, 'DELETE')).status).toBe(403);
    const normal = await call('/api/health-records', 'POST', { petId: 1, type: 'checkup', title: 'Ok', date: '2026-10-10' });
    expect((await call(`/api/health-records/${normal.body.record.id}`, 'PATCH', { petId: 4 })).status).toBe(403);
  });
  it.each(['CREDIT', 'DEBIT'])('demo %s succeeds, preserves history and unlocks pets', async cardType => {
    await downgrade();
    expect((await call('/api/billing/options')).body).toEqual({ mode: 'DEMO', amount: 39 });
    expect((await call('/api/billing/checkout', 'POST')).body.demo).toBe(true);
    const r = await call('/api/billing/simulate-payment', 'POST', { cardType, result: 'SUCCESS' });
    expect(r.status).toBe(200); expect(r.body.user.planType).toBe('PREMIUM');
    expect((await call('/api/pets/4', 'PATCH', { name: 'Unlocked' })).status).toBe(200);
    const history = (await call('/api/billing/history')).body.payments;
    expect(history).toHaveLength(1); expect(history[0].provider).toBe(`DEMO_${cardType}`);
    expect((await call('/api/billing/simulate-payment', 'POST', { cardType, result: 'SUCCESS' })).status).toBe(409);
    expect(await db.select().from(payments)).toHaveLength(1);
  });
  it('simulated upgrade persists in the account and concurrent confirmations create one payment', async () => {
    expect((await call('/api/billing/options', 'GET', undefined, '')).status).toBe(401);
    const responses = await Promise.all([
      call('/api/billing/simulate-payment', 'POST', { cardType: 'CREDIT', result: 'SUCCESS' }),
      call('/api/billing/simulate-payment', 'POST', { cardType: 'CREDIT', result: 'SUCCESS' })
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await call('/api/me')).body.user.planType).toBe('PREMIUM');
    expect((await call('/api/ads')).body.ads).toHaveLength(0);
    expect((await call('/api/billing/history')).body.payments).toHaveLength(1);
    expect((await call('/api/me', 'GET', undefined, otherToken)).body.user.planType).toBe('FREE');
  });
  it('declined demo never upgrades and rejects real card data', async () => {
    const r = await call('/api/billing/simulate-payment', 'POST', { cardType: 'DEBIT', result: 'FAILED' });
    expect(r.body.user.planType).toBe('FREE'); expect(r.body.status).toBe('FAILED');
    expect((await call('/api/billing/simulate-payment', 'POST', { cardType: 'CREDIT', result: 'SUCCESS', cardNumber: 'test' })).status).toBe(400);
  });
  it('unsigned webhook cannot upgrade membership', async () => {
    await db.insert(payments).values({ userId: 1, amount: '39', reference: 'guessable', status: 'PENDING' });
    expect([401, 503]).toContain((await call('/api/billing/webhook', 'POST', { reference: 'guessable', status: 'SUCCESS' }, '')).status);
    expect((await db.select().from(users).where(eq(users.id, 1)))[0].planType).toBe('FREE');
  });
  it('concurrent creates cannot exceed Free limit', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => call('/api/pets', 'POST', fullPet)));
    expect(results.filter(r => r.status === 201)).toHaveLength(2); expect(await db.select().from(pets)).toHaveLength(3);
  });
});

describe('Round 2: pet image and required fields (FR02)', () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=';
  it('stores and replaces uploaded image with profile fields', async () => {
    const r = await call('/api/pets', 'POST', { ...fullPet, avatarUrl: image }); expect(r.status).toBe(201);
    expect((await call(`/api/pets/${r.body.pet.id}`)).body.pet.image).toBe(image);
    expect((await call(`/api/pets/${r.body.pet.id}`)).body.pet.allergies).toBe(fullPet.allergies);
    await call(`/api/pets/${r.body.pet.id}`, 'PATCH', { avatarUrl: '' });
    expect((await call(`/api/pets/${r.body.pet.id}`)).body.pet.avatarUrl).toBeNull();
  });
  it.each([{ gender: '' }, { gender: undefined }, { gender: 'INVALID' }, { avatarUrl: 'javascript:alert(1)' }, { avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }, { avatarUrl: 'data:image/png;base64,aGVsbG8=' }])('rejects invalid profile %j', async change => { expect((await call('/api/pets', 'POST', { ...fullPet, ...change })).status).toBe(400); });
});

describe('Round 2: health records (FR03)', () => {
  const health = { petId: 1, type: 'วัคซีน', title: 'วัคซีนประจำปี', description: 'รายละเอียดครบ', date: '2026-10-10', provider: 'คลินิก', cost: 123.45 };
  it('edits all fields and keeps descending chronology and per-pet detail', async () => {
    await call('/api/health-records', 'POST', health);
    await call('/api/health-records', 'POST', { ...health, date: '2026-09-10', title: 'Earlier' });
    expect((await call('/api/health-records')).body.records.map((r: any) => r.title)).toEqual([health.title, 'Earlier']);
    expect((await call('/api/health-records/2', 'PATCH', { ...health, date: '2026-10-17', title: 'Edited', description: 'Changed', cost: 45.67 })).status).toBe(200);
    const rows = (await call('/api/health-records?petId=1')).body.records;
    expect(rows[0]).toMatchObject({ title: 'Edited', description: 'Changed', cost: '45.67', date: '2026-10-17' });
    expect((await call('/api/health-records?petId=999')).body.records).toHaveLength(0);
    expect((await call('/api/health-records/2', 'PATCH', { title: 'Other' }, otherToken)).status).toBe(404);
  });
  it.each([{ date: '2026-02-30' }, { date: '2099-01-01' }, { date: '' }, { title: ' ' }, { cost: -1 }, { cost: 'NaN' }, { cost: 100000000 }])('rejects invalid create and edit %j', async change => {
    expect((await call('/api/health-records', 'POST', { ...health, ...change })).status).toBe(400);
    await call('/api/health-records', 'POST', health);
    expect((await call('/api/health-records/1', 'PATCH', change)).status).toBe(400);
    expect((await call('/api/health-records')).body.records[0].title).toBe(health.title);
  });
});

describe('Round 2: notification timing, persistence and races (FR04/NFR)', () => {
  it('advance notification begins exactly at threshold and stays until done', async () => {
    await call('/api/reminders', 'POST', { ...reminder, scheduledAt: '2026-10-17T05:10:00Z', reminderMinutes: 5 });
    expect((await call('/api/reminders')).body.reminders[0].notificationDue).toBe(false);
    vi.setSystemTime(new Date('2026-10-17T05:05:00Z'));
    expect((await call('/api/reminders')).body.reminders[0].notificationDue).toBe(true);
    vi.setSystemTime(new Date('2026-10-17T05:11:00Z'));
    expect((await call('/api/reminders')).body.reminders[0].overdue).toBe(true);
    await call('/api/reminders/1/done', 'POST');
    expect((await call('/api/reminders')).body.reminders[0].notificationDue).toBe(false);
  });
  it('snooze clears current notification without subtracting advance time again', async () => {
    await call('/api/reminders', 'POST', { ...reminder, scheduledAt: '2026-10-17T05:10:00Z', reminderMinutes: 60 });
    expect((await call('/api/reminders')).body.reminders[0].notificationDue).toBe(true);
    await call('/api/reminders/1/snooze', 'POST', { scheduledAt: '2026-10-17T05:30:00Z' });
    expect((await call('/api/reminders')).body.reminders[0].notificationDue).toBe(false);
    vi.setSystemTime(new Date('2026-10-17T05:30:00Z'));
    expect((await call('/api/reminders')).body.reminders[0].notificationDue).toBe(true);
  });
  it('double done creates one health record and one future recurring reminder even when overdue', async () => {
    await db.insert(activities).values({ petId: 1, entryType: 'REMINDER', activityType: 'ยา', title: 'Overdue', activityDate: '2026-09-01', scheduledAt: new Date('2026-09-01T05:00:00Z'), recurrenceDays: 7 });
    const results = await Promise.all([call('/api/reminders/1/done', 'POST'), call('/api/reminders/1/done', 'POST')]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await call('/api/health-records')).body.records).toHaveLength(1);
    const reminders = (await call('/api/reminders')).body.reminders;
    expect(reminders).toHaveLength(2); expect(new Date(reminders[1].scheduledAt).valueOf()).toBeGreaterThan(Date.now());
    expect((await call('/api/reminders/1/snooze', 'POST', { scheduledAt: '2099-01-01T00:00:00Z' })).status).toBe(409);
  });
});

describe('Round 2: expense periods and security', () => {
  it('FR06.4 filters month/year including healthcare cost without mixing users', async () => {
    await call('/api/expenses', 'POST', { ...expense, date: '2025-01-01', amount: 100 });
    await call('/api/expenses', 'POST', { ...expense, date: '2026-09-01', amount: 200 });
    await call('/api/health-records', 'POST', { petId: 1, type: 'วัคซีน', title: 'Health', date: '2026-10-01', cost: 123.45 });
    expect((await call('/api/expenses?year=2026')).body.total).toBe(323.45);
    expect((await call('/api/expenses?year=2026&month=10')).body.total).toBe(123.45);
    expect((await call('/api/expenses?year=2024')).body.total).toBe(0);
    expect((await call('/api/expenses?month=13')).status).toBe(400);
    expect((await call('/api/expenses', 'GET', undefined, otherToken)).body.total).toBe(0);
  });
  it('malformed payloads, invalid identifiers and anonymous requests have controlled errors', async () => {
    const bad = await app.request('/api/pets', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{' }); expect(bad.status).toBe(400);
    expect((await call('/api/pets/NaN', 'PATCH', {})).status).toBe(400);
    expect((await call('/api/db-check', 'GET', undefined, '')).status).toBe(403);
    expect((await call('/api/health-records', 'GET', undefined, '')).status).toBe(401);
    expect((await call('/api/health')).body.status).toBe('ok');
    const response = await app.request('/api/pets', { headers: { Authorization: `Bearer ${token}` } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});


describe('Round 2: recovery and payment integrity', () => {
  it('signed webhook processes once, rejects tampering and expired signatures', async () => {
    await db.insert(payments).values({ userId: 1, amount: '39', reference: 'signed-test', status: 'PENDING' });
    const send = async (body: string, timestamp: number, signatureBody = body) => {
      const signature = createHmac('sha256', 'isolated-test-webhook-secret').update(`${timestamp}.${signatureBody}`).digest('hex');
      return app.request('/api/billing/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Payment-Timestamp': String(timestamp), 'X-Payment-Signature': signature }, body });
    };
    const body = JSON.stringify({ reference: 'signed-test', status: 'SUCCESS' });
    expect((await send(body, Date.now() / 1000 - 301)).status).toBe(401);
    expect((await send(body, Date.now() / 1000, '{}')).status).toBe(401);
    expect((await send(body, Date.now() / 1000)).status).toBe(200);
    expect((await send(body, Date.now() / 1000)).status).toBe(200);
    expect((await db.select().from(payments))[0].status).toBe('SUCCESS');
    expect((await db.select().from(users).where(eq(users.id, 1)))[0].planType).toBe('PREMIUM');
    expect((await call('/api/billing/verify?ref=signed-test', 'GET', undefined, otherToken)).status).toBe(404);
  });
  it('readiness reports outage without database details and recovers', async () => {
    expect((await call('/api/ready')).status).toBe(200);
    const spy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('private database details'));
    const down = await call('/api/ready'); expect(down.status).toBe(503); expect(JSON.stringify(down.body)).not.toContain('private');
    spy.mockRestore(); expect((await call('/api/ready')).status).toBe(200);
  });
  it('completed record uses Bangkok date around midnight', async () => {
    vi.setSystemTime(new Date('2026-10-17T18:00:00Z'));
    await call('/api/reminders', 'POST', { ...reminder, scheduledAt: '2026-10-20T00:00:00Z' });
    await call('/api/reminders/1/done', 'POST');
    expect((await call('/api/health-records')).body.records[0].date).toBe('2026-10-18');
  });
  it('malformed auth tokens and overlong values do not cause server errors', async () => {
    expect((await call('/api/me', 'GET', undefined, `${token}.extra`)).status).toBe(401);
    expect((await call('/api/me', 'PATCH', { username: 'x'.repeat(101) })).status).toBe(400);
    expect((await call('/api/care-plans', 'POST', { petId: 1, title: 'Plan', frequencyDays: 1.2 })).status).toBe(400);
    expect((await call('/api/care-plans', 'POST', { petId: 1, title: 'Plan', nextDueAt: '2026-02-30' })).status).toBe(400);
    expect((await call('/api/expenses', 'POST', { ...expense, category: 'x'.repeat(101) })).status).toBe(400);
  });
});


describe('Round 2: existing account workflows stay usable', () => {
  it('register, login, update profile and reject wrong password or duplicate email', async () => {
    const registration = { username: 'New user', email: 'new@example.test', password: 'Example123!' };
    const created = await call('/api/auth/register', 'POST', registration, '');
    expect(created.status).toBe(201); expect(created.body.user.passwordHash).toBeUndefined();
    expect((await call('/api/auth/register', 'POST', registration, '')).status).toBe(409);
    expect((await call('/api/auth/login', 'POST', { email: registration.email, password: 'wrong' }, '')).status).toBe(401);
    const login = await call('/api/auth/login', 'POST', registration, ''); expect(login.status).toBe(200);
    expect((await call('/api/me', 'PATCH', { username: 'Updated', role: 'ADMIN', planType: 'PREMIUM' }, login.body.token)).body.user).toMatchObject({ username: 'Updated', role: 'USER', planType: 'FREE' });
    expect((await call('/api/me/change-password', 'POST', { currentPassword: registration.password, newPassword: 'Changed123!' }, login.body.token)).status).toBe(200);
    expect((await call('/api/auth/login', 'POST', registration, '')).status).toBe(401);
    expect((await call('/api/auth/login', 'POST', { ...registration, password: 'Changed123!' }, '')).status).toBe(200);
  });
  it('concurrent same-email registration returns conflict instead of server error', async () => {
    const body = { username: 'Concurrent', email: 'race@example.test', password: 'Example123!' };
    const responses = await Promise.all([call('/api/auth/register', 'POST', body, ''), call('/api/auth/register', 'POST', body, '')]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
  });
});


describe('Ad targeting: species chosen by admin applies to every breed', () => {
  it.each(['HOME', 'REMINDERS', 'CARE'])('cat and dog ads appear in %s despite different breed category IDs', async (location) => {
    const [cat, dog] = await db.insert(petCategories).values([{ species: 'แมว', breed: 'วิเชียรมาศ' }, { species: 'หมา', breed: 'ชิบะ' }]).returning();
    await db.update(pets).set({ petCategoryId: cat.id }).where(eq(pets.petId, 1));
    const [dogPet] = await db.insert(pets).values({ userId: 1, petCategoryId: dog.id, name: 'โมจิ', gender: 'MALE', birthdate: fullPet.birthdate, weight: '7' }).returning();
    const [general] = await db.insert(ads).values({ petCategoryId: null, location: 'ALL', title: 'ทุกประเภท', content: 'สินค้าทั่วไป' }).returning();
    await db.insert(ads).values([
      { petCategoryId: cat.id, location: 'ALL', content: 'ปิดใช้งาน', isActive: false },
      { petCategoryId: cat.id, location: 'SIDEBAR', content: 'ตำแหน่งอื่น' }
    ]);
    const ids = (result: any) => result.body.ads.map((ad: any) => ad.id).sort((a: number, b: number) => a - b);
    expect(ids(await call(`/api/ads?location=${location}`))).toEqual([1, 2, general.id]);
    expect(ids(await call(`/api/ads?location=${location}&petId=1`))).toEqual([1, general.id]);
    expect(ids(await call(`/api/ads?location=${location}&petId=${dogPet.petId}`))).toEqual([2, general.id]);
    // Another user's animals must not influence targeting.
    expect(ids(await call(`/api/ads?location=${location}`, 'GET', undefined, otherToken))).toEqual([general.id]);
    // Recommendation categories also follow the species-only admin selector.
    expect((await call('/api/care-recommendations')).body.recommendations.map((rec: any) => rec.id).sort()).toEqual([1, 3]);
  });
});

it('Admin-created recommendations reach other breeds of the selected species and retain age filtering', async () => {
  await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, 2));
  const [category] = await db.insert(petCategories).values({ species: 'แมว', breed: 'วิเชียรมาศ' }).returning();
  await db.update(pets).set({ petCategoryId: category.id }).where(eq(pets.petId, 1));
  const categories = await call('/api/admin/pet-species', 'GET', undefined, otherToken);
  const catId = categories.body.categories.find((item: any) => item.species === 'แมว').id;
  const created = await call('/api/admin/recommendations', 'POST', { petCategoryId: catId, ageRange: 'ALL', title: 'คำแนะนำแมวใหม่', content: 'สำหรับแมวทุกสายพันธุ์' }, otherToken);
  expect(created.status).toBe(201);
  const id = created.body.recommendation.id;
  expect((await call('/api/care-recommendations')).body.recommendations.some((rec: any) => rec.id === id)).toBe(true);
  await call(`/api/admin/recommendations/${id}`, 'PATCH', { ageRange: 'BABY' }, otherToken);
  expect((await call('/api/care-recommendations')).body.recommendations.some((rec: any) => rec.id === id)).toBe(false);
  await call(`/api/admin/recommendations/${id}`, 'PATCH', { ageRange: 'ADULT' }, otherToken);
  expect((await call('/api/care-recommendations')).body.recommendations.some((rec: any) => rec.id === id)).toBe(true);
  await call(`/api/admin/recommendations/${id}`, 'PATCH', { petCategoryId: 2 }, otherToken);
  expect((await call('/api/care-recommendations')).body.recommendations.some((rec: any) => rec.id === id)).toBe(false);
});

it('Deleted recommendation disappears for every pet without deleting saved personal plans', async () => {
  await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, 1));
  await db.insert(pets).values({ userId: 1, petCategoryId: 1, name: 'Second pet', gender: 'FEMALE', birthdate: fullPet.birthdate, weight: '3' });
  await call('/api/care-plans', 'POST', { petId: 1, title: 'Saved personal plan', detail: 'Already saved' });
  expect((await call('/api/care-recommendations')).body.recommendations.filter((rec: any) => rec.id === 1)).toHaveLength(2);
  expect((await call('/api/admin/recommendations/1', 'DELETE', undefined, otherToken)).status).toBe(403);
  expect((await call('/api/admin/recommendations/1', 'DELETE')).status).toBe(204);
  expect((await call('/api/admin/recommendations')).body.recommendations.some((rec: any) => rec.id === 1)).toBe(false);
  expect((await call('/api/care-recommendations')).body.recommendations.some((rec: any) => rec.id === 1)).toBe(false);
  expect((await call('/api/care-plans')).body.plans[0].title).toBe('Saved personal plan');
});
