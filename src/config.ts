export const PORT = Number(process.env.PORT) || 4000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

export const AUTH_SECRET =
  process.env.AUTH_SECRET || "development-only-change-this-secret";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;

export const APP_URL = process.env.APP_URL || "http://localhost:5173";

export const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL;

export const PAYMENT_CHECKOUT_URL = process.env.PAYMENT_CHECKOUT_URL;
export const PREMIUM_PRICE = 149;

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
  process.env.CLIENT_ORIGIN || "*",
];

export const GOOGLE_ENABLED = Boolean(
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET,
);
