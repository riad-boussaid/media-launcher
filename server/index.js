import express from "express";
import router from "./routes/index.js";

const PORT = 5000;
const app = express();

app.use(express.json());
app.use("/", router);

app.listen(PORT, () => console.log(`Listining on: http://localhost:${PORT}\n`));

export default app;

// import dotenv from "dotenv";
// dotenv.config();
// import path from "path";
// import { fileURLToPath } from "url";
// import methodOverride from "method-override";

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// app.set("view engine", "ejs");
// app.set("views", path.join(__dirname, "views"));

// app.use(express.static(path.join(__dirname, "public")));

// app.use(methodOverride("_method"));
