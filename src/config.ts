// Centralised runtime configuration & constants.
// Reading environment variables happens once here so the rest of the codebase
// can import typed values instead of touching process.env directly.

export const PORT = Number(process.env.PORT) || 4000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// Auth / token signing
export const AUTH_SECRET =
  process.env.AUTH_SECRET || "development-only-change-this-secret";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30; // 30 minutes

// App URL (used to build password-reset links)
export const APP_URL = process.env.APP_URL || "http://localhost:5173";

// Email delivery webhook (optional)
export const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL;

// Payment provider (optional in dev). When unset, checkout returns 503.
export const PAYMENT_CHECKOUT_URL = process.env.PAYMENT_CHECKOUT_URL;
export const PREMIUM_PRICE = 149; // baht / month

// Google OAuth (Sign in with Google)
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;

// Apple Sign In
export const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
export const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
export const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY
  ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n")
  : "";
export const APPLE_REDIRECT_URI =
  process.env.APPLE_REDIRECT_URI ||
  `${APP_URL.replace(/\/$/, "")}/api/auth/apple/callback`;

// CORS origins
export const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://frontend:5173",
  process.env.CLIENT_ORIGIN || "*",
];

// Convenience flags
export const GOOGLE_ENABLED = Boolean(
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET,
);
export const APPLE_ENABLED = Boolean(
  APPLE_CLIENT_ID,
);
export const APPLE_WEB_OAUTH_ENABLED = Boolean(
  APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY,
);
