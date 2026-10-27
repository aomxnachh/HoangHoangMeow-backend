import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 4000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

export const AUTH_SECRET =
  process.env.AUTH_SECRET || "development-only-change-this-secret";
if (IS_PRODUCTION && (!process.env.AUTH_SECRET || AUTH_SECRET.length < 32 || AUTH_SECRET === "development-only-change-this-secret")) throw new Error("Set AUTH_SECRET to a unique secret of at least 32 characters");
// This project's default checkout is a simulation until a real provider is configured.
// An explicit flag can enable demo on a deployed site or disable it altogether.
export const PAYMENT_DEMO_ENABLED = process.env.PAYMENT_DEMO_ENABLED === 'true' ||
  (process.env.PAYMENT_DEMO_ENABLED !== 'false' && !process.env.PAYMENT_CHECKOUT_URL?.trim());
export const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;

export const APP_URL = process.env.APP_URL || "http://localhost:5173";

export const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL;

export const PAYMENT_CHECKOUT_URL = process.env.PAYMENT_CHECKOUT_URL?.trim();
export const PREMIUM_PRICE = 39;

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;

export const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://frontend:5173",
  ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
];

export const GOOGLE_ENABLED = Boolean(
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET,
);
