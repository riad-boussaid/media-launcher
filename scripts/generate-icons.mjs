#!/usr/bin/env node
/**
 * Builds every release icon from the canonical PNG renders in
 * desktop/resources. No image library is required: the ICO and ICNS containers
 * are assembled directly around the existing PNG payloads.
 *
 *   pnpm icons          # write/update generated icons
 *   pnpm icons:check    # fail if committed icons are out of date
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const resources = join(root, "desktop/resources");
const checkOnly = process.argv.includes("--check");

const sourceSizes = [16, 24, 32, 48, 64, 96, 128, 192, 256, 512];
const sources = new Map();

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("not a PNG file");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

for (const size of sourceSizes) {
  const path = join(resources, `play-${size}.png`);
  if (!existsSync(path)) {
    console.error(`Missing source icon: ${path}`);
    process.exit(1);
  }
  const data = readFileSync(path);
  const actual = pngSize(data);
  if (actual.width !== size || actual.height !== size) {
    console.error(
      `Source icon ${path} is ${actual.width}x${actual.height}, expected ${size}x${size}.`,
    );
    process.exit(1);
  }
  sources.set(size, data);
}

/** ICNS type codes mapped to the square PNG size that fills them. */
const icnsTypes = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];

function buildIcns() {
  const entries = icnsTypes.map(([type, size]) => {
    const data = sources.get(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const body = Buffer.concat(entries);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

function buildIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = [];
  const payloads = [];
  let offset = 6 + sizes.length * 16;

  for (const size of sizes) {
    const data = sources.get(size);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // color palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(data);
    offset += data.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(sizes.length, 4);
  return Buffer.concat([header, ...entries, ...payloads]);
}

const outputs = [];
const addFile = (relative, data) => outputs.push({ relative, data });
const addCopy = (relative, size) =>
  outputs.push({ relative, data: sources.get(size) });

// Browser extension manifest icons. play-logo.png stays as the runtime UI
// asset referenced from shared code.
for (const browser of ["chrome", "firefox"]) {
  for (const size of [16, 32, 48, 96, 128]) {
    addCopy(`extensions/${browser}/public/icons/icon-${size}.png`, size);
  }
}

// electron-builder reads Linux icons from a directory of NxN.png files.
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  addCopy(`desktop/build/icons/${size}x${size}.png`, size);
}
addCopy("desktop/build/icon.png", 512);
addFile("desktop/build/icon.icns", buildIcns());
addFile("desktop/build/icon.ico", buildIco());
// Runtime tray/app icon on Windows; keep the packaged copy multi-size too.
addFile("desktop/resources/play.ico", buildIco());

// Store listing artwork.
addCopy("store/assets/icon-128.png", 128);
addCopy("store/assets/icon-512.png", 512);

let changed = 0;
let stale = 0;

for (const { relative, data } of outputs) {
  const path = join(root, relative);
  if (checkOnly) {
    if (!existsSync(path)) {
      console.error(`Missing generated icon: ${relative}`);
      stale += 1;
      continue;
    }
    if (!readFileSync(path).equals(data)) {
      console.error(`Out-of-date generated icon: ${relative}`);
      stale += 1;
    }
    continue;
  }

  const current = existsSync(path) ? readFileSync(path) : null;
  if (current && current.equals(data)) continue;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  changed += 1;
}

if (checkOnly) {
  if (stale > 0) {
    console.error("Run `pnpm icons` to regenerate them.");
    process.exit(1);
  }
  console.log(`Generated icons are current (${outputs.length} files).`);
} else {
  console.log(
    changed === 0
      ? `Generated icons already current (${outputs.length} files).`
      : `Updated ${changed} of ${outputs.length} icon files.`,
  );
}
