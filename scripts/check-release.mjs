#!/usr/bin/env node
/**
 * Release sanity checks shared by CI and the release workflow.
 *
 * Usage:
 *   node scripts/check-release.mjs            # validate the working tree
 *   node scripts/check-release.mjs v1.0.0     # also require tag == version
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const notes = [];

const readJson = (relative) =>
  JSON.parse(readFileSync(join(root, relative), "utf-8"));

const version = readJson("package.json").version;
// Only treat the environment ref as a tag when GitHub says it is one. On pull
// requests GITHUB_REF_NAME is something like "1/merge", not a release tag.
const explicitTag = process.argv[2]?.trim();
const envTag =
  process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME?.trim()
    : undefined;
const tag = explicitTag || envTag || "";

// 1. All package and manifest versions match the root version.
const sync = spawnSync(
  process.execPath,
  [join(root, "scripts/sync-version.mjs"), "--check"],
  { cwd: root, encoding: "utf-8" },
);
if (sync.status !== 0) {
  errors.push(sync.stderr.trim() || "Version check failed.");
} else {
  notes.push(`Versions aligned at ${version}`);
}

// 2. A release tag, when supplied, points at this version.
if (tag) {
  const normalized = tag.replace(/^v/, "");
  if (normalized !== version) {
    errors.push(`Git tag ${tag} does not match package version ${version}.`);
  } else {
    notes.push(`Tag ${tag} matches version ${version}`);
  }
}

// 3. The changelog has a non-empty section for this version.
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf-8");
const changelogHeading = new RegExp(
  `^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`,
  "m",
);
if (!changelogHeading.test(changelog)) {
  errors.push(`CHANGELOG.md has no [${version}] section.`);
} else {
  notes.push("Changelog section present");
}

// 4. Manifest icons exist in each extension's public directory and all
//    referenced sizes are declared.
for (const browser of ["chrome", "firefox"]) {
  const dir = join(root, `extensions/${browser}`);
  const manifest = readJson(`extensions/${browser}/manifest.json`);
  const icons = manifest.icons ?? {};
  const actionIcons =
    manifest.action?.default_icon &&
    typeof manifest.action.default_icon === "object"
      ? manifest.action.default_icon
      : {};

  for (const [size, relative] of Object.entries({ ...icons, ...actionIcons })) {
    if (!existsSync(join(dir, "public", relative))) {
      errors.push(`${browser} manifest icon ${size} missing: public/${relative}`);
    }
  }
  if (Object.keys(icons).length < 3) {
    errors.push(`${browser} manifest declares fewer than three icon sizes.`);
  } else {
    notes.push(`${browser} manifest has ${Object.keys(icons).length} icon sizes`);
  }
}

// 5. Store-required Firefox metadata.
const firefox = readJson("extensions/firefox/manifest.json");
const gecko = firefox.browser_specific_settings?.gecko;
if (!gecko?.id) {
  errors.push("Firefox manifest is missing browser_specific_settings.gecko.id.");
}
const required = gecko?.data_collection_permissions?.required;
if (!Array.isArray(required) || required.length === 0) {
  errors.push(
    "Firefox manifest is missing gecko.data_collection_permissions.required.",
  );
} else {
  notes.push(`Firefox data collection: ${required.join(", ")}`);
}

// 6. Chrome permissions should not include capabilities the code does not use.
const chrome = readJson("extensions/chrome/manifest.json");
if ((chrome.permissions ?? []).includes("scripting")) {
  errors.push(
    "Chrome manifest still requests the unused `scripting` permission.",
  );
}

// 7. Release-facing documentation and artwork are present.
const requiredFiles = [
  "docs/releasing.md",
  "docs/index.html",
  "docs/privacy-policy.md",
  "docs/privacy-policy.html",
  "store/chrome/listing.md",
  "store/firefox/listing.md",
  "store/assets/icon-128.png",
  "store/assets/icon-512.png",
  "store/assets/chrome-promo-440x280.png",
  "store/assets/chrome-marquee-1400x560.png",
  "store/assets/screenshot-popup-1280x800.png",
  "store/assets/screenshot-options-1280x800.png",
  "store/assets/screenshot-player-1280x800.png",
  "store/assets/firefox-screenshot-1280x800.png",
  "desktop/build/icon.ico",
  "desktop/build/icon.icns",
  "desktop/build/icons/512x512.png",
];
for (const relative of requiredFiles) {
  if (!existsSync(join(root, relative))) {
    errors.push(`Missing release asset: ${relative}`);
  }
}

if (errors.length > 0) {
  console.error("Release checks failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`Release checks passed for ${version}:`);
for (const note of notes) console.log(`  - ${note}`);
