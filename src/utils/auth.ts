// Token signing / verification and password hashing helpers.
// Uses Node's built-in crypto (scrypt + HMAC-SHA256) — no external JWT lib.

import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { AUTH_SECRET, TOKEN_TTL_SECONDS } from "../config.js";
import type { users } from "../db/schema.js";

const scrypt = promisify(scryptCallback);

type User = typeof users.$inferSelect;

export function signToken(user: User) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyToken(token: string): number | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", AUTH_SECRET)
    .update(payload)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as { sub?: number; exp?: number };
    return typeof decoded.sub === "number" &&
      typeof decoded.exp === "number" &&
      decoded.exp > Date.now() / 1000
      ? decoded.sub
      : null;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function passwordMatches(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expectedHex = derived.toString("hex");
  return (
    expected.length === expectedHex.length &&
    timingSafeEqual(Buffer.from(expected, "hex"), derived)
  );
}

// Produces a non-reversible hash for storing/looking up password-reset tokens.
export function hashResetToken(token: string) {
  return createHmac("sha256", AUTH_SECRET).update(token).digest("hex");
}

// Strips sensitive fields before returning a user to the client.
export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    planType: user.planType,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
  };
}
