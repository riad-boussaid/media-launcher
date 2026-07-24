import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const serverDir = join(root, "server");
const stagingDir = join(import.meta.dirname, ".server-staging");

// Clean staging
if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true });
mkdirSync(stagingDir, { recursive: true });

// Copy server dist
cpSync(join(serverDir, "dist"), join(stagingDir, "server"), { recursive: true });

// Create minimal package.json with only production deps
const serverPkg = JSON.parse(
  await import(join(serverDir, "package.json"), { with: { type: "json" } }).then(
    (m) => JSON.stringify(m.default),
  ),
);
const prodPkg = {
  name: serverPkg.name,
  version: serverPkg.version,
  type: "module",
  dependencies: serverPkg.dependencies || {},
};
writeFileSync(join(stagingDir, "server", "package.json"), JSON.stringify(prodPkg, null, 2));

// Install production deps into staging
console.log("Installing production server dependencies...");
execSync("npm install --production --ignore-scripts", {
  cwd: join(stagingDir, "server"),
  stdio: "inherit",
});

console.log("Server staging ready at", stagingDir);
