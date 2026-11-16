#!/usr/bin/env node
/**
 * Extracts the release notes for one version from CHANGELOG.md.
 * Usage: node scripts/changelog-section.mjs 1.0.0
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv[2]?.replace(/^v/, "");

if (!requested) {
  console.error("Usage: node scripts/changelog-section.mjs <version>");
  process.exit(1);
}

const lines = readFileSync(join(root, "CHANGELOG.md"), "utf-8").split(/\r?\n/);
const heading = new RegExp(
  `^## \\[${requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\](?:\\s+-\\s+.*)?$`,
);
const start = lines.findIndex((line) => heading.test(line));

if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${requested}.`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i += 1) {
  if (/^##\s/.test(lines[i])) {
    end = i;
    break;
  }
}

const body = lines
  .slice(start + 1, end)
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

if (!body) {
  console.error(`CHANGELOG.md section for ${requested} is empty.`);
  process.exit(1);
}

process.stdout.write(`${body}\n`);
