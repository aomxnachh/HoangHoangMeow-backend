import { asText } from './helpers.js';

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= '1900-01-01';
}

export const validText = (value: string) => /^[\p{L}\p{M}\p{N}\s-]+$/u.test(value);
export const presentNumber = (value: unknown) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));

export function validatePet(body: Record<string, unknown>, partial = false) {
  const errors: Record<string, string> = {};
  for (const key of ['name', 'species', 'breed', 'color']) {
    if (partial && body[key] === undefined) continue;
    const text = asText(body[key]);
    if (!text && ['name', 'species'].includes(key)) errors[key] = key === 'name' ? 'กรุณากรอกชื่อสัตว์เลี้ยง' : 'กรุณาเลือกชนิดสัตว์เลี้ยง';
    else if (text && (!validText(text) || text.length > 100)) errors[key] = 'รูปแบบข้อมูลไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง';
  }
  if (!partial || body.birthdate !== undefined) {
    if (!validDate(body.birthdate) || body.birthdate > today()) errors.birthdate = 'กรุณากรอกวันเกิดที่ถูกต้องและไม่เกินวันนี้';
  }
  if (!partial || body.weight !== undefined) {
    if (!presentNumber(body.weight) || Number(body.weight) <= 0 || Number(body.weight) > 9999.99) errors.weight = 'กรุณากรอกน้ำหนักมากกว่า 0 และไม่เกิน 9999.99 กก.';
  }
  if ((!partial || body.gender !== undefined) && !['MALE', 'FEMALE', 'UNKNOWN'].includes(asText(body.gender))) errors.gender = 'กรุณาเลือกเพศสัตว์เลี้ยง';
  if (body.avatarUrl && !validPetImage(body.avatarUrl)) errors.avatarUrl = 'กรุณาใช้รูป JPEG PNG หรือ WebP ขนาดไม่เกิน 2 MB';
  for (const key of ['allergies', 'notes']) {
    if (asText(body[key]).length > 500) errors[key] = 'กรุณากรอกไม่เกิน 500 ตัวอักษร';
  }
  return errors;
}

export function validateExpense(body: Record<string, unknown>, partial = false) {
  if (asText(body.category).length > 100 || asText(body.description).length > 5000) return 'ข้อมูลยาวเกินกำหนด';
  if ((!partial || body.category !== undefined) && !asText(body.category)) return 'กรุณาเลือกหมวดหมู่';
  if ((!partial || body.description !== undefined) && !validText(asText(body.description))) return 'กรุณากรอกรายละเอียดโดยไม่ใช้อักขระพิเศษ';
  if ((!partial || body.date !== undefined) && (!validDate(body.date) || body.date > today())) return 'กรุณากรอกวันที่ถูกต้องและไม่เกินวันนี้';
  if ((!partial || body.amount !== undefined) && (!presentNumber(body.amount) || Number(body.amount) < 0 || Number(body.amount) > 99999999.99)) return 'กรุณากรอกจำนวนเงินที่ถูกต้อง';
  return null;
}

export function reminderDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !validDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
}

export function validateReminder(body: Record<string, unknown>, partial = false) {
  if (asText(body.productUrl)) {
    try { const url = new URL(asText(body.productUrl)); if (!['https:', 'http:'].includes(url.protocol)) return 'กรุณากรอกลิงก์สินค้าให้ถูกต้อง'; }
    catch { return 'กรุณากรอกลิงก์สินค้าให้ถูกต้อง'; }
  }
  for (const key of ['type', 'title']) {
    if ((!partial || body[key] !== undefined) && (!asText(body[key]) || asText(body[key]).length > (key === 'title' ? 255 : 100))) return 'กรุณากรอกประเภทและหัวข้อการแจ้งเตือนให้ครบถ้วน';
  }
  if (!partial || body.scheduledAt !== undefined) {
    const when = reminderDate(body.scheduledAt);
    if (!when) return 'กรุณากรอกวันและเวลาให้ถูกต้องครบถ้วน';
    if (when.valueOf() <= Date.now()) return 'ไม่สามารถเลือกวัน/เวลาที่ผ่านมาแล้วได้';
  }
  for (const key of ['recurrenceDays', 'reminderMinutes']) {
    if (body[key] != null && (!presentNumber(body[key]) || !Number.isSafeInteger(Number(body[key])) || Number(body[key]) < 0 || Number(body[key]) > 2147483647)) return 'ระยะเวลาการแจ้งเตือนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป';
  }
  return null;
}

export function validPetImage(value: unknown) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > 2796204) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 12 || bytes.toString('base64') !== match[2]) return false;
  if (match[1] === 'png') return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (match[1] === 'jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
}
export function validateHealth(body: Record<string, unknown>, partial = false) {
  for (const key of ['type', 'title']) if ((!partial || body[key] !== undefined) && (!asText(body[key]) || asText(body[key]).length > (key === 'type' ? 100 : 255))) return 'กรุณากรอกประเภทและหัวข้อให้ถูกต้อง';
  if ((!partial || body.date !== undefined) && (!validDate(body.date) || body.date > today())) return 'กรุณากรอกวันที่ถูกต้องและไม่เกินวันนี้';
  if (body.cost != null && body.cost !== '' && (!presentNumber(body.cost) || Number(body.cost) < 0 || Number(body.cost) > 99999999.99)) return 'ค่าใช้จ่ายต้องอยู่ระหว่าง 0 ถึง 99999999.99 บาท';
  if (asText(body.provider).length > 255 || asText(body.description).length > 5000) return 'ข้อมูลยาวเกินกำหนด';
  return null;
}

export function validateCare(body: Record<string, unknown>) {
  if (asText(body.title).length > 255 || asText(body.detail).length > 5000) return 'ข้อมูลยาวเกินกำหนด';
  if (body.frequencyDays != null && (!presentNumber(body.frequencyDays) || !Number.isSafeInteger(Number(body.frequencyDays)) || Number(body.frequencyDays) < 0 || Number(body.frequencyDays) > 36500)) return 'รอบการดูแลต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 36500 วัน';
  if (body.nextDueAt !== undefined && !validDate(String(body.nextDueAt).slice(0, 10))) return 'วันที่ไม่ถูกต้อง';
  return null;
}
