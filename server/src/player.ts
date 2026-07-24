import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getSettings } from "./db.js";

function parseArgs(str: string): string[] {
  return str.split(/\s+/).filter(Boolean);
}

function getPlayerExeName(key: string, customPlayerPath: string): string {
  switch (key) {
    case "mpv":
      return "mpv";
    case "iina":
      return "iina";
    case "potplayer":
      return "PotPlayerMini64";
    case "custom":
      return customPlayerPath || "mpv";
    default:
      return "mpv";
  }
}

function getBinDir(binDir: string): string {
  if (binDir) return binDir;
  return join(process.cwd(), "bin");
}

function resolvePlayerPath(
  key: string,
  settings: { customPlayerPath: string; binDir: string },
): string {
  const name = getPlayerExeName(key, settings.customPlayerPath);
  if (key === "custom") return name;
  const bin = getBinDir(settings.binDir);
  const inBin = join(bin, name);
  if (existsSync(inBin)) return inBin;
  const exeName =
    process.platform === "win32" && !name.endsWith(".exe")
      ? `${name}.exe`
      : name;
  const inBinExe = join(bin, exeName);
  if (existsSync(inBinExe)) return inBinExe;
  return name;
}

export interface PlayerResult {
  success: boolean;
  error?: string;
}

export function launchPlayer(
  url: string,
  extensionOptions: string[] = [],
): PlayerResult {
  const settings = getSettings();
  const key = settings.player || "mpv";
  const exe = resolvePlayerPath(key, settings);

  let args: string[];

  switch (key) {
    case "mpv": {
      const userArgs = parseArgs(settings.playerArgs?.mpv || "");
      args = [...extensionOptions, ...userArgs, url];
      break;
    }
    case "custom": {
      const template = settings.customPlayerArgs || "{url}";
      args = parseArgs(template).map((p) => (p === "{url}" ? url : p));
      break;
    }
    default: {
      args = [url];
    }
  }

  const proc = spawn(exe, args, {
    stdio: "ignore",
  });
  proc.on("error", (err) =>
    console.error(`Failed to launch ${exe}:`, err.message),
  );
  console.log(`[${exe}] ${url}`);
  return { success: true };
}
