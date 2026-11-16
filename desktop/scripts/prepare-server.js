const { execSync } = require("child_process");
const {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} = require("fs");
const { join } = require("path");

const root = join(__dirname, "..", "..");
const serverDir = join(root, "server");
const serverDist = join(serverDir, "dist");
const stagingDir = join(__dirname, "..", "server-dist");
const stagingServer = stagingDir;

if (!existsSync(serverDist)) {
  throw new Error(
    "server/dist not found; run `pnpm -C server run build` first.",
  );
}

// Clean staging
if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true });
mkdirSync(stagingServer, { recursive: true });

// Copy server dist, leaving TypeScript declarations and source maps out of the
// shipped app.
cpSync(serverDist, stagingServer, {
  recursive: true,
  filter: (src) => !/\.(map|d\.ts)$/.test(src),
});

// Create minimal package.json with only production deps. Pin each top-level
// dependency to the version resolved by the server lockfile instead of letting
// npm re-resolve the semver range at packaging time.
const serverPkg = JSON.parse(
  readFileSync(join(serverDir, "package.json"), "utf-8"),
);

function resolvedVersion(name) {
  try {
    return JSON.parse(
      readFileSync(
        join(serverDir, "node_modules", name, "package.json"),
        "utf-8",
      ),
    ).version;
  } catch {
    return null;
  }
}

const prodPkg = {
  name: serverPkg.name,
  version: serverPkg.version,
  type: "module",
  dependencies: Object.fromEntries(
    Object.entries(serverPkg.dependencies || {}).map(([name, range]) => [
      name,
      resolvedVersion(name) ?? range,
    ]),
  ),
};
writeFileSync(
  join(stagingServer, "package.json"),
  JSON.stringify(prodPkg, null, 2),
);

// Install production deps with npm (flat structure, no pnpm symlinks).
// better-sqlite3 ships N-API prebuilds for every supported platform inside the
// package, so --ignore-scripts is safe and no per-platform copy is needed.
console.log("Installing production server dependencies...");
execSync("npm install --omit=dev --ignore-scripts --no-audit --no-fund", {
  cwd: stagingServer,
  stdio: "inherit",
});

const prebuilds = join(
  stagingServer,
  "node_modules",
  "better-sqlite3",
  "prebuilds",
);
if (!existsSync(prebuilds)) {
  throw new Error(
    "better-sqlite3 prebuilds missing from the staged server; packaging would produce a broken app.",
  );
}

console.log("Server staging ready at", stagingDir);
