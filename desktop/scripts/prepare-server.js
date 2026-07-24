const { execSync } = require("child_process");
const { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..", "..");
const serverDir = join(root, "server");
const stagingDir = join(__dirname, "..", "server-dist");
const stagingServer = stagingDir;

// Clean staging
if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true });
mkdirSync(stagingServer, { recursive: true });

// Copy server dist
cpSync(join(serverDir, "dist"), stagingServer, { recursive: true });

// Create minimal package.json with only production deps
const serverPkg = JSON.parse(readFileSync(join(serverDir, "package.json"), "utf-8"));
const prodPkg = {
  name: serverPkg.name,
  version: serverPkg.version,
  type: "module",
  dependencies: serverPkg.dependencies || {},
};
writeFileSync(join(stagingServer, "package.json"), JSON.stringify(prodPkg, null, 2));

// Install production deps with npm (flat structure, no pnpm symlinks)
console.log("Installing production server dependencies...");
execSync("npm install --omit=dev --ignore-scripts", {
  cwd: stagingServer,
  stdio: "inherit",
});

// Copy pre-built native binary from original server node_modules
const betterSqlite3Src = join(serverDir, "node_modules", "better-sqlite3");
const betterSqlite3Dest = join(stagingServer, "node_modules", "better-sqlite3");

// Find and copy prebuilt binaries from the pnpm store
const pnpmDir = join(serverDir, "node_modules", ".pnpm");
const { readdirSync } = require("fs");
const prebuiltDir = join(betterSqlite3Dest, "prebuilds", "win32-x64");
const releaseDir = join(betterSqlite3Dest, "build", "Release");

// Try to find the native addon in the pnpm store
function findNativeAddon(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "better_sqlite3.node") return join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = findNativeAddon(join(dir, entry.name));
      if (result) return result;
    }
  }
  return null;
}

// Also copy prebuilds directory if it exists
const prebuildsSrc = join(betterSqlite3Src, "prebuilds");
if (existsSync(prebuildsSrc)) {
  cpSync(prebuildsSrc, prebuiltDir, { recursive: true, dereference: true });
}

// Copy build/Release from pnpm store
const buildSrc = join(betterSqlite3Src, "build");
if (existsSync(buildSrc)) {
  cpSync(buildSrc, releaseDir, { recursive: true, dereference: true });
}

console.log("Server staging ready at", stagingDir);
