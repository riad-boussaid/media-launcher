import { serve } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initAuthToken, requireToken } from "./auth.js";
import { getDataDir, initDatabase } from "./db.js";
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

function isAllowedHost(host: string | undefined): boolean {
  if (!host) return true; // HTTP/1.0 clients send no Host; not a rebinding vector
  let name = host;
  if (name.startsWith("[")) {
    // IPv6 literal, possibly "[::1]:5000"
    const end = name.indexOf("]");
    if (end !== -1) name = name.slice(0, end + 1);
  } else {
    const colon = name.lastIndexOf(":");
    if (colon !== -1) name = name.slice(0, colon);
  }
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

// DNS-rebinding defense: a rebound domain resolves to 127.0.0.1 but arrives
// with the attacker's Host header, so reject anything that is not loopback.
const hostCheck: MiddlewareHandler = async (c, next) => {
  if (!isAllowedHost(c.req.header("host"))) {
    return c.json({ err: "forbidden host" }, 403);
  }
  await next();
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

// Every route except the health probe requires the shared token. This keeps
// drive-by requests from web pages (which can send POSTs even under CORS's
// no-cors mode) from reaching any handler.
app.use("*", async (c, next) => {
  if (c.req.path === "/api/health") return next();
  return requireToken()(c, next);
});

app.route("/", routes);

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
