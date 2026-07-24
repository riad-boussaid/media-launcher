import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import type { Settings } from "./store";
import { getBinDir, checkSystemPath, resolveSystemPath } from "./downloads";

export interface PlayerResult {
  success: boolean;
  error?: string;
}

function parseArgs(str: string): string[] {
  return str.split(/\s+/).filter(Boolean);
}

function getPlayerExeName(key: string, settings: Settings): string {
  switch (key) {
    case "mpv": return "mpv";
    case "iina": return "iina";
    case "potplayer": return "PotPlayerMini64";
    case "custom": return settings.customPlayerPath || "mpv";
    default: return "mpv";
  }
}

function resolvePlayerPath(key: string, settings: Settings): string {
  const name = getPlayerExeName(key, settings);
  if (key === "custom") return name;
  const inBin = join(getBinDir(), name);
  if (existsSync(inBin)) return inBin;
  const exeName = process.platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : name;
  const inBinExe = join(getBinDir(), exeName);
  if (existsSync(inBinExe)) return inBinExe;
  return resolveSystemPath(name);
}

export function checkPlayerExists(exe: string): Promise<boolean> {
  return checkSystemPath(exe);
}

export async function launchPlayer(url: string, extensionOptions: string[], settings: Settings): Promise<PlayerResult> {
  const key = settings.player || "mpv";
  const exe = resolvePlayerPath(key, settings);

  const available = existsSync(exe) || await checkPlayerExists(exe);
  if (!available) {
    const msg = `Player not found: ${exe}`;
    console.error(msg);
    return { success: false, error: msg };
  }

  let args: string[];

  switch (key) {
    case "mpv": {
      const userArgs = parseArgs(settings.playerArgs["mpv"] || "");
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

  const proc = spawn(exe, args, { stdio: "ignore" });
  proc.on("error", (err) => console.error(`Failed to launch ${exe}:`, err.message));
  console.log(`[${exe}] ${url}`);
  return { success: true };
}
