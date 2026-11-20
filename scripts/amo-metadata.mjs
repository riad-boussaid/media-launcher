#!/usr/bin/env node
/**
 * Builds the version metadata for the automated Firefox submission to AMO.
 *
 * Usage:
 *   node scripts/amo-metadata.mjs <version> <output.json>
 *
 * The release workflow passes this file to `web-ext sign --amo-metadata`, which
 * merges it into the version object. The source archive is uploaded separately
 * with `--upload-source-code`.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = (process.argv[2] ?? "").trim().replace(/^v/, "");
const output = (process.argv[3] ?? "").trim();

if (!version || !output) {
  console.error("Usage: node scripts/amo-metadata.mjs <version> <output.json>");
  process.exit(1);
}

const notes = execFileSync(
  process.execPath,
  [join(root, "scripts/changelog-section.mjs"), version],
  { encoding: "utf-8" },
)
  .trim()
  // AMO's release notes field is plain text; drop Markdown heading markers.
  .replace(/^#{1,6}\s+/gm, "");

// AMO's release-notes field is small; keep the public notes readable and link
// readers to the changelog instead of rejecting an oversized submission.
const MAX_RELEASE_NOTES = 4500;
let releaseNotes = notes;
if (releaseNotes.length > MAX_RELEASE_NOTES) {
  const cut = releaseNotes.lastIndexOf("\n", MAX_RELEASE_NOTES);
  releaseNotes = `${releaseNotes.slice(0, cut > 0 ? cut : MAX_RELEASE_NOTES).trimEnd()}\n\n…`;
}

const approvalNotes = [
  "Build instructions for AMO review:",
  `The attached source archive is a clean export of the v${version} tag.`,
  "Requirements: Node.js 22+ and pnpm 11+.",
  "From the media-launcher-${version}/ directory inside the archive:",
  "  pnpm install",
  "  pnpm -C extensions/firefox install --frozen-lockfile",
  "  pnpm build:firefox",
  "  pnpm package:firefox",
  `The packaged XPI is artifacts/media-launcher-firefox-${version}.xpi.`,
  "Extension source lives in extensions/firefox; shared source is in extensions/shared.",
  "The build uses Vite + vite-plugin-web-extension to bundle TypeScript/React and",
  "Tailwind/PostCSS to generate CSS. No remote code is fetched at runtime.",
].join("\n");

const metadata = {
  version: {
    license: "MIT",
    release_notes: { "en-US": releaseNotes },
    approval_notes: approvalNotes,
  },
};

writeFileSync(output, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(
  `Wrote AMO metadata for ${version} (${releaseNotes.length} release-note characters) to ${output}.`,
);
