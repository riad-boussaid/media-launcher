import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context, MiddlewareHandler } from "hono";
import { findRemoteSession, touchRemoteSession } from "./db.js";

let token: string | null = null;

/**
 * Load (or generate and persist) the API token.
 *
 * Resolution order: AUTH_TOKEN env var, then <dataDir>/auth-token, then a
 * freshly generated token written to that file. The desktop app reads the
 * same file to authenticate its own requests, and the browser extensions
 * receive the token through their options page.
 */
export function initAuthToken(dataDir: string): string {
  if (token) return token;

  const envToken = process.env.AUTH_TOKEN?.trim();
  if (envToken) {
    token = envToken;
    return token;
  }

  const tokenPath = join(dataDir, "auth-token");
  try {
    if (existsSync(tokenPath)) {
      const stored = readFileSync(tokenPath, "utf-8").trim();
      if (stored) {
        token = stored;
        return token;
      }
    }
  } catch (err) {
    console.error("Failed to read auth token:", err);
  }

  token = randomBytes(24).toString("base64url");
  try {
    writeFileSync(tokenPath, token, { mode: 0o600 });
  } catch (err) {
    console.error("Failed to persist auth token:", err);
  }
  return token;
}

export function getAuthToken(): string | null {
  return token;
}

// Hash both sides so timingSafeEqual's fixed length requirement holds and
// token length never leaks.
function tokensMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** SHA-256 hex of a token — the stored key for remote-control sessions. */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Pulls the raw token out of the Authorization / X-Auth-Token headers. */
export function extractToken(c: Context): string {
  const auth = c.req.header("Authorization");
  return (
    auth?.startsWith("Bearer ")
      ? auth.slice(7)
      : (c.req.header("X-Auth-Token") ?? "")
  ).trim();
}

/** True when `provided` matches the master token (desktop/extensions). */
export function matchesMasterToken(provided: string): boolean {
  return !!provided && !!token && tokensMatch(provided, token);
}

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const pairingCodes = new Map<string, number>();
const consumedPairingCodes = new Map<string, number>();

function prunePairingCodes(map: Map<string, number>, now: number): void {
  for (const [hash, expiry] of map) {
    if (expiry <= now) map.delete(hash);
  }
}

export interface IssuedPairingCode {
  code: string;
  expiresAt: number;
}

/** Creates a random one-time code for the desktop QR/manual pairing UI. */
export function issuePairingCode(now = Date.now()): IssuedPairingCode {
  prunePairingCodes(pairingCodes, now);
  prunePairingCodes(consumedPairingCodes, now);
  const code = randomBytes(18).toString("base64url");
  const expiresAt = now + PAIRING_CODE_TTL_MS;
  pairingCodes.set(hashToken(code), expiresAt);
  return { code, expiresAt };
}

export type PairingCodeResult = "ok" | "used" | "expired" | "invalid";

/** Validates and atomically consumes a one-time pairing code. */
export function consumePairingCode(
  code: string,
  now = Date.now(),
): PairingCodeResult {
  if (!code) return "invalid";
  const hash = hashToken(code);
  const expiresAt = pairingCodes.get(hash);
  if (expiresAt === undefined) {
    const usedUntil = consumedPairingCodes.get(hash);
    return usedUntil !== undefined && usedUntil > now ? "used" : "invalid";
  }

  pairingCodes.delete(hash);
  consumedPairingCodes.set(hash, now + PAIRING_CODE_TTL_MS);
  return expiresAt <= now ? "expired" : "ok";
}

// Throttles last_seen writes so busy remotes don't hammer SQLite.
const lastSeenFlush = new Map<string, number>();

export function requireToken(): MiddlewareHandler {
  return async (c, next) => {
    if (!token) {
      console.error("Auth token not initialized; rejecting request");
      return c.json({ err: "server auth not initialized" }, 503);
    }
    const provided = extractToken(c);
    if (provided && tokensMatch(provided, token)) {
      await next();
      return;
    }
    if (provided) {
      // Remote-control session tokens — hashed into the sessions table.
      const hash = hashToken(provided);
      if (findRemoteSession(hash)) {
        const now = Date.now();
        if (now - (lastSeenFlush.get(hash) ?? 0) > 60000) {
          lastSeenFlush.set(hash, now);
          touchRemoteSession(hash);
        }
        await next();
        return;
      }
    }
    return c.json({ err: "unauthorized: missing or invalid auth token" }, 401);
  };
}
