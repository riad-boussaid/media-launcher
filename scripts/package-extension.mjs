#!/usr/bin/env node
/**
 * Packages a built browser extension into a distributable archive:
 *
 *   node scripts/package-extension.mjs chrome   -> artifacts/*.zip
 *   node scripts/package-extension.mjs firefox  -> artifacts/*.xpi
 *
 * The manifest is placed at the archive root, as both the Chrome Web Store and
 * addons.mozilla.org expect. Builds with stale or missing files fail loudly.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browser = process.argv[2];

if (browser !== "chrome" && browser !== "firefox") {
  console.error("Usage: node scripts/package-extension.mjs <chrome|firefox>");
  process.exit(1);
}

const packageDir = join(root, "extensions", browser);
const distDir = join(packageDir, "dist");
const manifestPath = join(distDir, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`No built manifest at ${relative(root, manifestPath)}.`);
  console.error(`Run \`pnpm build:${browser}\` first.`);
  process.exit(1);
}

const rootVersion = JSON.parse(
  readFileSync(join(root, "package.json"), "utf-8"),
).version;
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

if (manifest.version !== rootVersion) {
  console.error(
    `Built manifest version ${manifest.version} does not match package version ${rootVersion}. Rebuild the extension.`,
  );
  process.exit(1);
}

if (browser === "firefox") {
  const gecko = manifest.browser_specific_settings?.gecko;
  if (!gecko?.id) {
    console.error("Firefox manifest is missing browser_specific_settings.gecko.id.");
    process.exit(1);
  }
  if (!Array.isArray(gecko.data_collection_permissions?.required)) {
    console.error(
      "Firefox manifest is missing gecko.data_collection_permissions.required (required by AMO).",
    );
    process.exit(1);
  }
}

const ignore = [
  /\.map$/i,
  /\.d\.ts$/i,
  /(^|\/)(\.DS_Store|Thumbs\.db)$/i,
  /(^|\/)(node_modules|\.vite|\.cache)(\/|$)/i,
  /\.(log|crx|pem|key|p12|pfx)$/i,
];

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const relativePath = relative(distDir, absolute).split(sep).join("/");
    if (ignore.some((pattern) => pattern.test(relativePath))) continue;
    if (entry.isDirectory()) {
      files.push(...collect(absolute));
    } else if (entry.isFile()) {
      files.push({ absolute, relative: relativePath });
    }
  }
  return files;
}

const files = collect(distDir).sort((a, b) =>
  a.relative.localeCompare(b.relative),
);

if (!files.some((file) => file.relative === "manifest.json")) {
  console.error("manifest.json is not at the dist root.");
  process.exit(1);
}

// Every icon the manifest points at must have made it into the build.
const iconPaths = new Set();
for (const value of Object.values(manifest.icons ?? {})) iconPaths.add(value);
const actionIcons = manifest.action?.default_icon;
if (actionIcons && typeof actionIcons === "object") {
  for (const value of Object.values(actionIcons)) iconPaths.add(value);
}
const builtPaths = new Set(files.map((file) => file.relative));
for (const icon of iconPaths) {
  if (!builtPaths.has(icon)) {
    console.error(`Manifest icon missing from build output: ${icon}`);
    process.exit(1);
  }
}

const entries = {};
let uncompressedBytes = 0;
for (const file of files) {
  const data = new Uint8Array(readFileSync(file.absolute));
  entries[file.relative] = data;
  uncompressedBytes += data.length;
}

// Timestamp every entry with the release date from the changelog (or
// SOURCE_DATE_EPOCH) so rebuilding the same tag produces the same bytes.
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf-8");
const releaseDate = changelog.match(
  new RegExp(
    `^## \\[${rootVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\](?:\\s+-\\s+(\\d{4}-\\d{2}-\\d{2}))?`,
    "m",
  ),
)?.[1];
const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH);
const mtime = releaseDate
  ? new Date(`${releaseDate}T00:00:00Z`)
  : Number.isFinite(sourceDateEpoch) && sourceDateEpoch > 0
    ? new Date(sourceDateEpoch * 1000)
    : new Date("1980-01-01T00:00:00Z");

const archive = zipSync(entries, { level: 9, mtime });
const extension = browser === "chrome" ? "zip" : "xpi";
const outDir = join(root, "artifacts");
mkdirSync(outDir, { recursive: true });
const outPath = join(
  outDir,
  `media-launcher-${browser}-${rootVersion}.${extension}`,
);
writeFileSync(outPath, archive);

// Re-open the archive so a broken ZIP is caught here rather than by a store.
const verified = unzipSync(archive);
const verifiedNames = Object.keys(verified).sort();
const expectedNames = files.map((file) => file.relative).sort();
if (
  verifiedNames.length !== expectedNames.length ||
  verifiedNames.some((name, i) => name !== expectedNames[i])
) {
  console.error("Archive verification failed: entry list does not match the build.");
  process.exit(1);
}
const archivedManifest = JSON.parse(
  Buffer.from(verified["manifest.json"]).toString("utf-8"),
);
if (archivedManifest.version !== rootVersion) {
  console.error("Archived manifest version is wrong.");
  process.exit(1);
}

const sha256 = createHash("sha256").update(archive).digest("hex");
const compressedBytes = archive.length;
const ratio =
  uncompressedBytes === 0
    ? "0"
    : ((compressedBytes / uncompressedBytes) * 100).toFixed(1);

console.log(
  `Packaged ${browser} ${rootVersion}: ${relative(root, outPath)} ` +
    `(${files.length} files, ${(compressedBytes / 1024).toFixed(1)} KiB, ` +
    `${ratio}% of ${(uncompressedBytes / 1024).toFixed(1)} KiB)`,
);
console.log(`sha256 ${sha256}`);
