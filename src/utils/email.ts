//email deli
import { APP_URL, EMAIL_WEBHOOK_URL, IS_PRODUCTION } from "../config.js";

export async function sendResetMessage(email: string, token: string) {
  const resetUrl = `${APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  if (!EMAIL_WEBHOOK_URL) return { delivered: false, resetUrl };
  try {
    const response = await fetch(EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "รีเซ็ตรหัสผ่าน HoangHoangMeow",
        resetUrl,
      }),
    });
    return { delivered: response.ok, resetUrl };
  } catch {
    return { delivered: false, resetUrl };
  }
}

export const shouldExposeDevResetUrl = (delivered: boolean) =>
  !IS_PRODUCTION && !delivered;
