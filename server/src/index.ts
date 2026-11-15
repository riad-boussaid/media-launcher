import { serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initAuthToken, requireToken } from "./auth.js";
import { getDataDir, getSettings, initDatabase } from "./db.js";
import { remotePageHtml } from "./remote.js";
import routes from "./routes.js";

function parsePort(raw: string | undefined): number {
  if (!raw) return 5000;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 5000;
  return port;
}

function parseHost(raw: string | undefined): string {
  const host = raw?.trim();
  return host ? host : "127.0.0.1";
}

const PORT = parsePort(process.env.PORT);
// Loopback by default so the API is never reachable from the network.
const HOST = parseHost(process.env.HOST);

const app = new Hono();

function stripPort(host: string | undefined): string | null {
  if (!host) return null;
  let name = host;
  if (name.startsWith("[")) {
    // IPv6 literal, possibly "[::1]:5000"
    const end = name.indexOf("]");
    if (end !== -1) name = name.slice(0, end + 1);
  } else {
    const colon = name.lastIndexOf(":");
    if (colon !== -1) name = name.slice(0, colon);
  }
  return name;
}

function isLoopbackHost(name: string): boolean {
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

// Phones and other LAN devices (private ranges, mDNS names), plus Tailscale's
// CGNAT range (100.64/10) so the remote works from outside the LAN too. Never
// matches public domains, so DNS-rebinding attacks from the internet stay
// blocked.
function isPrivateLanHost(name: string): boolean {
  if (
    /^10\.\d+\.\d+\.\d+$/.test(name) ||
    /^192\.168\.\d+\.\d+$/.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(name)
  ) {
    return true;
  }
  // Tailscale assigns addresses in 100.64.0.0/10.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(name)) {
    return true;
  }
  if (name.endsWith(".local")) return true;
  // Single-label hostname (e.g. "mypc" on the LAN)
  if (!name.includes(".") && !name.includes(":")) return true;
  return false;
}

// DNS-rebinding defense: a rebound domain resolves to 127.0.0.1 but arrives
// with the attacker's Host header, so reject anything that is not loopback —
// unless remote control is enabled, which opens the door to LAN devices only
// (all data routes still require the token).
const hostCheck: MiddlewareHandler = async (c, next) => {
  const name = stripPort(c.req.header("host"));
  if (name === null || isLoopbackHost(name)) {
    await next();
    return;
  }
  if (getSettings().remoteEnabled && isPrivateLanHost(name)) {
    await next();
    return;
  }
  return c.json({ err: "forbidden host" }, 403);
};

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (
      u.protocol === "chrome-extension:" ||
      u.protocol === "moz-extension:" ||
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1"
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

app.use("*", hostCheck);

app.use(
  "*",
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Auth-Token"],
  }),
);

// Every route except the health probe, the remote-control page (static,
// token-free) and its pairing endpoint (validates the master token itself)
// requires the shared token. This keeps drive-by requests from web pages
// (which can send POSTs even under CORS's no-cors mode) from reaching any
// handler.
app.use("*", async (c, next) => {
  if (
    c.req.path === "/api/health" ||
    c.req.path === "/remote" ||
    c.req.path === "/remote/pair"
  ) {
    return next();
  }
  return requireToken()(c, next);
});

app.route("/", routes);
app.get("/remote", (c) =>
  c.html(remotePageHtml(), 200, { "Cache-Control": "no-store" }),
);

try {
  initDatabase();
  initAuthToken(getDataDir());
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to initialize server: ${message}`);
  process.exit(1);
}

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`Server listening on http://${info.address}:${info.port}\n`);
});
