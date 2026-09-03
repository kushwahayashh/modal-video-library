import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS PASSWORD — set the site password via the ACCESS_PASSWORD environment
// variable (see server/.env). Falls back to "modal" when unset.
// ─────────────────────────────────────────────────────────────────────────────
export const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "modal";

export const AUTH_COOKIE = "luna_auth";

// 30-day session.
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// Secret used to sign session tokens. Derived from the password unless an
// explicit AUTH_SECRET is provided. Changing the password invalidates old tokens.
const SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash("sha256").update(`luna-auth-secret::${ACCESS_PASSWORD}`).digest("hex");

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Create a signed, expiring session token. */
export function createToken(): string {
  const payload = String(Date.now() + TOKEN_TTL_MS);
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/** Verify a session token's signature and expiry. */
export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [encPayload, sig] = token.split(".");
  if (!encPayload || !sig) return false;

  let payload: string;
  try {
    payload = Buffer.from(encPayload, "base64url").toString();
  } catch {
    return false;
  }

  if (!safeEqual(sig, sign(payload))) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && Date.now() <= exp;
}

/** Constant-time password comparison. */
export function checkPassword(password: unknown): boolean {
  return typeof password === "string" && safeEqual(password, ACCESS_PASSWORD);
}

// ─────────────────────────────────────────────────────────────────────────────
// Share tokens — a deterministic signature bound to a video id. A valid token
// in a stream URL bypasses the session cookie check so that "Copy Link" URLs
// play/download for anyone who has the link, without needing the site password.
// ─────────────────────────────────────────────────────────────────────────────

/** Create a share token for a specific video id. */
export function createShareToken(videoId: string): string {
  return sign(`share::${videoId}`);
}

/** Verify a share token matches the given video id. */
export function verifyShareToken(videoId: string, token: string | undefined | null): boolean {
  if (!token || !videoId) return false;
  return safeEqual(token, createShareToken(videoId));
}

/** Parse a Cookie header into a key/value map. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

/** Build a Set-Cookie header value for the session cookie. */
export function buildAuthCookie(token: string, secure: boolean): string {
  const attrs = [
    `${AUTH_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/** Build a Set-Cookie header value that clears the session cookie. */
export function clearAuthCookie(secure: boolean): string {
  const attrs = [`${AUTH_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
