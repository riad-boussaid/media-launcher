import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDatabase } from "./db.js";
import routes from "./routes.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.route("/", routes);

initDatabase();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}\n`);
});
