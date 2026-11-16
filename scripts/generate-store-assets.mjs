#!/usr/bin/env node
/**
 * Renders the store listing artwork from store/templates with headless Chrome
 * or Edge. The resulting PNGs are committed; rerun this only when the copy or
 * design changes.
 *
 *   node scripts/generate-store-assets.mjs
 *   CHROME_PATH=/path/to/chrome node scripts/generate-store-assets.mjs
 *   node scripts/generate-store-assets.mjs --check
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templates = join(root, "store/templates");
const outDir = join(root, "store/assets");
const checkOnly = process.argv.includes("--check");

const assets = [
  {
    template: "promo.html",
    output: "chrome-promo-440x280.png",
    width: 440,
    height: 280,
  },
  {
    template: "marquee.html",
    output: "chrome-marquee-1400x560.png",
    width: 1400,
    height: 560,
  },
  {
    template: "screenshot-popup.html",
    output: "screenshot-popup-1280x800.png",
    width: 1280,
    height: 800,
  },
  {
    template: "screenshot-player.html",
    output: "screenshot-player-1280x800.png",
    width: 1280,
    height: 800,
  },
  {
    template: "screenshot-options.html",
    output: "screenshot-options-1280x800.png",
    width: 1280,
    height: 800,
  },
  {
    template: "firefox-screenshot.html",
    output: "firefox-screenshot-1280x800.png",
    width: 1280,
    height: 800,
  },
];

function pngSize(path) {
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    }
    return process.env.CHROME_PATH;
  }

  const candidates = [];
  if (process.platform === "win32") {
    for (const base of [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ]) {
      if (!base) continue;
      candidates.push(
        join(base, "Google/Chrome/Application/chrome.exe"),
        join(base, "Microsoft/Edge/Application/msedge.exe"),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Last resort: a command on PATH.
  for (const command of [
    "google-chrome",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
  ]) {
    const probe = spawnSync(command, ["--version"], { encoding: "utf-8" });
    if (probe.status === 0) return command;
  }

  throw new Error(
    "Chrome or Edge was not found. Set CHROME_PATH to the browser executable.",
  );
}

if (checkOnly) {
  let bad = 0;
  for (const asset of assets) {
    const path = join(outDir, asset.output);
    if (!existsSync(path)) {
      console.error(`Missing store asset: ${asset.output}`);
      bad += 1;
      continue;
    }
    const size = pngSize(path);
    if (size.width !== asset.width || size.height !== asset.height) {
      console.error(
        `${asset.output} is ${size.width}x${size.height}, expected ${asset.width}x${asset.height}`,
      );
      bad += 1;
    }
  }
  if (bad > 0) process.exit(1);
  console.log(`Store assets are present and correctly sized (${assets.length} files).`);
  process.exit(0);
}

const browser = findBrowser();
const profile = mkdtempSync(join(tmpdir(), "media-launcher-store-"));
mkdirSync(outDir, { recursive: true });

try {
  for (const asset of assets) {
    const templatePath = join(templates, asset.template);
    if (!existsSync(templatePath)) {
      throw new Error(`Missing template: ${templatePath}`);
    }
    const outPath = join(outDir, asset.output);
    const result = spawnSync(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--allow-file-access-from-files",
        "--force-device-scale-factor=1",
        "--run-all-compositor-stages-before-draw",
        `--window-size=${asset.width},${asset.height}`,
        `--user-data-dir=${profile}`,
        `--virtual-time-budget=2000`,
        `--screenshot=${outPath}`,
        pathToFileURL(templatePath).href,
      ],
      { encoding: "utf-8", timeout: 60_000 },
    );

    if (result.status !== 0) {
      throw new Error(
        `Failed to render ${asset.template}:\n${result.stderr || result.stdout}`,
      );
    }
    if (!existsSync(outPath)) {
      throw new Error(`Browser did not write ${outPath}`);
    }
    const size = pngSize(outPath);
    if (size.width !== asset.width || size.height !== asset.height) {
      throw new Error(
        `${asset.output} rendered at ${size.width}x${size.height}, expected ${asset.width}x${asset.height}`,
      );
    }
    console.log(`Rendered ${asset.output} (${size.width}x${size.height})`);
  }
} finally {
  rmSync(profile, { recursive: true, force: true });
}
