#!/usr/bin/env node
/**
 * Keeps every shipped artifact on the version declared in the root
 * package.json. Run `pnpm version:sync` after bumping the root version, and
 * `pnpm version:check` in CI.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const rootPkgPath = join(root, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
const version = rootPkg.version;

if (typeof version !== "string" || version.length === 0) {
  console.error("Root package.json is missing a version field.");
  process.exit(1);
}

// Chrome and Firefox both require 1-4 dot-separated integers. Pre-release
// suffixes are fine for GitHub tags but not for extension manifests, so fail
// early instead of producing an artifact the stores reject.
if (!/^\d+(\.\d+){0,3}$/.test(version)) {
  console.error(
    `Version "${version}" is not a store-compatible version (expected 1-4 dot-separated integers).`,
  );
  process.exit(1);
}

const jsonTargets = [
  "server/package.json",
  "desktop/package.json",
  "extensions/chrome/package.json",
  "extensions/firefox/package.json",
  "extensions/chrome/manifest.json",
  "extensions/firefox/manifest.json",
];

const changes = [];
const mismatches = [];

const versionKey = /("version"\s*:\s*)"[^"]*"/;

for (const relative of jsonTargets) {
  const path = join(root, relative);
  const source = readFileSync(path, "utf-8");
  if (!versionKey.test(source)) {
    console.error(`${relative}: no top-level "version" field found.`);
    process.exit(1);
  }
  const next = source.replace(versionKey, `$1"${version}"`);
  if (next !== source) {
    changes.push(relative);
    if (checkOnly) {
      mismatches.push(relative);
    } else {
      writeFileSync(path, next);
    }
  }
}

// The server advertises its version on /api/health; keep the constant aligned
// with the package version so clients can compare versions.
const serverVersionPath = join(root, "server/src/version.ts");
const serverVersionSource = readFileSync(serverVersionPath, "utf-8");
const serverVersionKey = /export const SERVER_VERSION = "[^"]*";/;
if (!serverVersionKey.test(serverVersionSource)) {
  console.error("server/src/version.ts: SERVER_VERSION declaration not found.");
  process.exit(1);
}
const nextServerVersion = serverVersionSource.replace(
  serverVersionKey,
  `export const SERVER_VERSION = "${version}";`,
);
if (nextServerVersion !== serverVersionSource) {
  changes.push("server/src/version.ts");
  if (checkOnly) {
    mismatches.push("server/src/version.ts");
  } else {
    writeFileSync(serverVersionPath, nextServerVersion);
  }
}

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error(`Versions do not match root version ${version}:`);
    for (const file of mismatches) console.error(`  - ${file}`);
    console.error("Run `pnpm version:sync` to update them.");
    process.exit(1);
  }
  console.log(`Versions aligned at ${version}.`);
  process.exit(0);
}

if (changes.length === 0) {
  console.log(`Versions already aligned at ${version}.`);
} else {
  console.log(`Set version ${version} in:`);
  for (const file of changes) console.log(`  - ${file}`);
}
