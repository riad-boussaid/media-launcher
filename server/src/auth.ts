import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";

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

export function requireToken(): MiddlewareHandler {
  return async (c, next) => {
    if (!token) {
      console.error("Auth token not initialized; rejecting request");
      return c.json({ err: "server auth not initialized" }, 503);
    }
    const auth = c.req.header("Authorization");
    const provided = (
      auth?.startsWith("Bearer ")
        ? auth.slice(7)
        : (c.req.header("X-Auth-Token") ?? "")
    ).trim();
    if (provided && tokensMatch(provided, token)) {
      await next();
      return;
    }
    return c.json({ err: "unauthorized: missing or invalid auth token" }, 401);
  };
}
