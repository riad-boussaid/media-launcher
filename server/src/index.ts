import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDatabase } from "./db.js";
import routes from "./routes.js";

function parsePort(raw: string | undefined): number {
  if (!raw) return 5000;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 5000;
  return port;
}

const PORT = parsePort(process.env.PORT);

const app = new Hono();

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (
    origin === "null" ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:")
  ) {
    return true;
  }
  try {
    const u = new URL(origin);
    if (u.protocol === "chrome-extension:" || u.protocol === "moz-extension:") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

app.use(
  "*",
  cors({
    origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.route("/", routes);

try {
  initDatabase();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to initialize database: ${message}`);
  process.exit(1);
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}\n`);
});