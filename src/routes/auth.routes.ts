import { randomBytes } from "node:crypto";
import {
  getAuthorizationToken,
  getAuthorizationUrl,
  getClientSecret,
  verifyIdToken,
} from "apple-signin-auth";
import { and, eq, isNull } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  APPLE_CLIENT_ID,
  APPLE_ENABLED,
  APPLE_KEY_ID,
  APPLE_PRIVATE_KEY,
  APPLE_REDIRECT_URI,
  APPLE_TEAM_ID,
  APPLE_WEB_OAUTH_ENABLED,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_ENABLED,
  GOOGLE_REDIRECT_URI,
  IS_PRODUCTION,
  PASSWORD_RESET_TTL_MS,
} from "../config.js";
import { db } from "../db/index.js";
import { passwordResetTokens, users } from "../db/schema.js";
import { type AppContext, type AppEnv } from "../middleware/auth.js";
import {
  hashPassword,
  hashResetToken,
  passwordMatches,
  publicUser,
  signToken,
} from "../utils/auth.js";
import {
  sendResetMessage,
  shouldExposeDevResetUrl,
} from "../utils/email.js";
import { asText } from "../utils/helpers.js";

export const authRoutes = new Hono<AppEnv>();

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function startOAuthState(c: AppContext, provider: "google" | "apple") {
  const state = randomBytes(24).toString("base64url");
  setCookie(c, `${provider}_oauth_state`, state, {
    httpOnly: true,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: "/",
    sameSite: "Lax",
    secure: IS_PRODUCTION,
  });
  return state;
}

function consumeOAuthState(
  c: AppContext,
  provider: "google" | "apple",
  state: string,
) {
  const cookieName = `${provider}_oauth_state`;
  const expected = getCookie(c, cookieName);
  deleteCookie(c, cookieName, { path: "/" });
  return Boolean(state && expected && state === expected);
}
//EmailPass
authRoutes.post("/api/auth/register", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const username = asText(body.username);
  const email = asText(body.email).toLowerCase();
  const password = asText(body.password);
  if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    return c.json(
      { error: "กรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษรให้ครบถ้วน" },
      400,
    );
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) return c.json({ error: "อีเมลนี้ถูกใช้งานแล้ว" }, 409);
  const [user] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash: await hashPassword(password),
      phone: asText(body.phone) || null,
      authProvider: "EMAIL",
    })
    .returning();
  return c.json({ token: signToken(user), user: publicUser(user) }, 201);
});

authRoutes.post("/api/auth/login", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const email = asText(body.email).toLowerCase();
  const password = asText(body.password);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (
    !user ||
    user.deletedAt ||
    !(await passwordMatches(password, user.passwordHash))
  )
    return c.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401);
  return c.json({ token: signToken(user), user: publicUser(user) });
});

// ---------------------------------------------------------------------------
// Password reset (token delivered by email)
// ---------------------------------------------------------------------------

authRoutes.post("/api/auth/forgot-password", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const email = asText(body.email).toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Always return the same message to avoid account enumeration.
  const generic = {
    message: "หากมีบัญชีตามอีเมลนี้ ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้",
  };
  if (!user || user.deletedAt) return c.json(generic);
  const token = randomBytes(32).toString("base64url");
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, user.id));
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });
  const emailResult = await sendResetMessage(user.email, token);
  return c.json({
    ...generic,
    ...(shouldExposeDevResetUrl(emailResult.delivered)
      ? { developmentResetUrl: emailResult.resetUrl }
      : {}),
  });
});

authRoutes.post("/api/auth/reset-password", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const token = asText(body.token);
  const password = asText(body.password);
  if (!token || password.length < 8)
    return c.json({ error: "ลิงก์หรือรหัสผ่านไม่ถูกต้อง" }, 400);
  const [reset] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashResetToken(token)));
  if (!reset || reset.usedAt || reset.expiresAt < new Date())
    return c.json({ error: "ลิงก์รีเซ็ตรหัสผ่านหมดอายุหรือถูกใช้แล้ว" }, 400);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        updatedAt: new Date(),
      })
      .where(eq(users.id, reset.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, reset.id));
  });
  return c.json({ message: "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว" });
});

// ---------------------------------------------------------------------------
// Google OAuth 2.0
// ---------------------------------------------------------------------------

function googleOAuthClient() {
  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );
}

// Step 1 — redirect the browser to Google's consent screen.
authRoutes.get("/api/auth/google", (c) => {
  if (!GOOGLE_ENABLED)
    return c.json(
      { error: "ยังไม่ได้ตั้งค่า Google OAuth (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)" },
      503,
    );
  const state = startOAuthState(c, "google");
  return c.redirect(
    googleOAuthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["openid", "email", "profile"],
      state,
    }),
  );
});

// Step 2 — Google redirects back here with ?code=, we exchange it for tokens
// and verify the ID token, then create/sign-in the user.
authRoutes.get("/api/auth/google/callback", async (c) => {
  if (!GOOGLE_ENABLED)
    return c.json({ error: "Google OAuth ยังไม่ได้ตั้งค่า" }, 503);
  const code = asText(c.req.query("code"));
  const error = asText(c.req.query("error"));
  const state = asText(c.req.query("state"));
  if (error || !code)
    return c.json({ error: "การเข้าสู่ระบบด้วย Google ถูกยกเลิก" }, 400);
  if (!consumeOAuthState(c, "google", state))
    return c.json({ error: "Google OAuth state ไม่ถูกต้องหรือหมดอายุ" }, 400);

  let idToken: string | undefined;
  try {
    const { tokens } = await googleOAuthClient().getToken(code);
    idToken = tokens.id_token || undefined;
  } catch (err) {
    console.error("Google authorization-code exchange failed:", err);
    return c.json({ error: "แลกเปลี่ยนโทเคนจาก Google ไม่สำเร็จ" }, 502);
  }
  if (!idToken)
    return c.json({ error: "ไม่ได้รับ ID token จาก Google" }, 502);

  // Verify & decode the ID token with Google's public keys.
  const profile = await verifyGoogleIdToken(idToken);
  if (!profile)
    return c.json({ error: "ยืนยันตัวตนกับ Google ไม่สำเร็จ" }, 401);

  const result = await loginOrCreateSocialUser({
    provider: "GOOGLE",
    providerId: profile.sub,
    email: profile.email,
    name: profile.name || profile.email.split("@")[0],
  });
  if ("error" in result)
    return c.json({ error: result.error }, result.status);
  return respondWithSocialSession(c, result);
});

async function verifyGoogleIdToken(idToken: string) {
  try {
    const ticket = await googleOAuthClient().verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email || !payload.email_verified)
      return null;
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || "",
    };
  } catch (err) {
    console.error("Google ID token verification failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Apple Sign In
// ---------------------------------------------------------------------------

// Browser flow: redirect to Apple, receive a form POST callback, exchange the
// code, and verify the returned identity token.
authRoutes.get("/api/auth/apple", (c) => {
  if (!APPLE_WEB_OAUTH_ENABLED)
    return c.json({ error: "Apple Sign In is not configured for the web" }, 503);
  const state = startOAuthState(c, "apple");
  return c.redirect(
    getAuthorizationUrl({
      clientID: APPLE_CLIENT_ID,
      redirectUri: APPLE_REDIRECT_URI,
      scope: "name email",
      state,
    }),
  );
});

authRoutes.post("/api/auth/apple/callback", async (c) => {
  if (!APPLE_WEB_OAUTH_ENABLED)
    return c.json({ error: "Apple Sign In is not configured for the web" }, 503);
  const body = await c.req.parseBody();
  const code = asText(body.code);
  const state = asText(body.state);
  if (!code || !consumeOAuthState(c, "apple", state))
    return c.json({ error: "Apple OAuth state is invalid or expired" }, 400);

  try {
    const clientSecret = getClientSecret({
      clientID: APPLE_CLIENT_ID,
      teamID: APPLE_TEAM_ID,
      keyIdentifier: APPLE_KEY_ID,
      privateKey: APPLE_PRIVATE_KEY,
    });
    const tokens = await getAuthorizationToken(code, {
      clientID: APPLE_CLIENT_ID,
      clientSecret,
      redirectUri: APPLE_REDIRECT_URI,
    });
    const profile = await verifyAppleIdToken(tokens.id_token);
    if (!profile)
      return c.json({ error: "Apple identity verification failed" }, 401);
    const result = await loginOrCreateSocialUser({
      provider: "APPLE",
      providerId: profile.sub,
      email: profile.email,
      name: appleName(asText(body.user)) || profile.email.split("@")[0] || "",
    });
    if ("error" in result)
      return c.json({ error: result.error }, result.status);
    return respondWithSocialSession(c, result);
  } catch (err) {
    console.error("Apple authorization-code exchange failed:", err);
    return c.json({ error: "Apple authorization-code exchange failed" }, 502);
  }
});

// Front-end flow: the iOS/Safari client obtains the Apple identityToken and
// POSTs it here. We verify it with Apple's public keys and sign in/up.
authRoutes.post("/api/auth/apple", async (c) => {
  if (!APPLE_ENABLED)
    return c.json(
      { error: "ยังไม่ได้ตั้งค่า Apple Sign In (APPLE_CLIENT_ID / TEAM_ID / KEY_ID / PRIVATE_KEY)" },
      503,
    );
  const body = await c.req.json<Record<string, unknown>>();
  const identityToken = asText(body.identityToken);
  if (!identityToken)
    return c.json({ error: "กรอก identityToken จาก Apple" }, 400);

  const profile = await verifyAppleIdToken(identityToken);
  if (!profile)
    return c.json({ error: "ยืนยันตัวตนกับ Apple ไม่สำเร็จ" }, 401);

  const result = await loginOrCreateSocialUser({
    provider: "APPLE",
    providerId: profile.sub,
    email: profile.email,
    name:
      asText(body.name) ||
      profile.email.split("@")[0] ||
      `apple_${profile.sub.slice(0, 8)}`,
  });
  if ("error" in result)
    return c.json({ error: result.error }, result.status);
  return respondWithSocialSession(c, result);
});

async function verifyAppleIdToken(idToken: string) {
  try {
    const payload = await verifyIdToken(idToken, {
      audience: APPLE_CLIENT_ID, // our bundle/service ID
    });
    if (!payload?.sub) return null;
    // Apple only sends email on the *first* sign-in; later logins rely on sub.
    return {
      sub: payload.sub,
      email: payload.email?.toLowerCase() || "",
    };
  } catch (err) {
    console.error("Apple ID token verification failed:", err);
    return null;
  }
}

function appleName(serializedUser: string) {
  try {
    const user = JSON.parse(serializedUser) as {
      name?: { firstName?: unknown; lastName?: unknown };
    };
    return [asText(user.name?.firstName), asText(user.name?.lastName)]
      .filter(Boolean)
      .join(" ");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Shared social-login account resolution
// ---------------------------------------------------------------------------

type SocialLoginInput = {
  provider: "GOOGLE" | "APPLE";
  providerId: string;
  email: string;
  name: string;
};

type SocialLoginResult =
  | { token: string; user: ReturnType<typeof publicUser> }
  | { error: string; status: 403 | 409 };

// Find by provider+id, else by email, else create a new account. Social users
// get a random unusable password hash so they can only log in via the provider.
export async function loginOrCreateSocialUser(
  input: SocialLoginInput,
): Promise<SocialLoginResult> {
  const { provider, providerId, email, name } = input;
  const providerIdColumn =
    provider === "GOOGLE" ? users.googleId : users.appleId;

  // 1. Same provider + provider ID → existing linked account.
  const [byProvider] = await db
    .select()
    .from(users)
    .where(eq(providerIdColumn, providerId));
  if (byProvider?.deletedAt)
    return { error: "account has been deleted", status: 403 };
  if (byProvider)
    return { token: signToken(byProvider), user: publicUser(byProvider) };

  // 2. Email already used by an email/password account → link the provider to
  //    it so the user keeps their existing pets/data.
  if (email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)));
    if (byEmail) {
      const [updated] = await db
        .update(users)
        .set(
          provider === "GOOGLE"
            ? {
                authProvider: provider,
                authProviderId: providerId,
                googleId: providerId,
                updatedAt: new Date(),
              }
            : {
                authProvider: provider,
                authProviderId: providerId,
                appleId: providerId,
                updatedAt: new Date(),
              },
        )
        .where(eq(users.id, byEmail.id))
        .returning();
      return { token: signToken(updated), user: publicUser(updated) };
    }
  }

  // 3. Brand new account.
  const username =
    name || (email ? email.split("@")[0] : `${provider.toLowerCase()}_${providerId.slice(0, 8)}`);
  const [user] = await db
    .insert(users)
    .values({
      username,
      email: email || `${provider.toLowerCase()}_${providerId}@noemail.local`,
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
      authProvider: provider,
      authProviderId: providerId,
      ...(provider === "GOOGLE"
        ? { googleId: providerId }
        : { appleId: providerId }),
    })
    .returning();
  return { token: signToken(user), user: publicUser(user) };
}

// Renders the success payload. In a real SPA the front-end would parse this
// from a redirect URL; we keep it JSON for flexibility.
function respondWithSocialSession(
  c: AppContext,
  result: { token: string; user: unknown },
) {
  return c.json(result);
}

// Generic fallback for any other provider string (kept for compatibility).
authRoutes.post("/api/auth/social/:provider", (c) =>
  c.json(
    {
      error: `ยังไม่รองรับ OAuth สำหรับ ${c.req.param("provider")} ใช้ /api/auth/google หรือ /api/auth/apple`,
    },
    501,
  ),
);
