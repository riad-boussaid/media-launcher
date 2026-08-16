import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getSettings } from "./db.js";

function parseArgs(str: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    args.push(m[1] ?? m[2] ?? m[3]);
  }
  return args;
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
  if (key === "iina") {
    const iina = "/Applications/IINA.app/Contents/MacOS/iina";
    if (existsSync(iina)) return iina;
  }
  return name;
}

export interface PlayerResult {
  success: boolean;
  error?: string;
}

function spawnPlayer(
  exe: string,
  args: string[],
  timeoutMs = 10000,
): Promise<PlayerResult> {
  return new Promise((resolve) => {
    const proc = spawn(exe, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: `Timed out launching ${exe}` });
    }, timeoutMs);

    proc.once("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: `Failed to launch ${exe}: ${err.message}`,
      });
    });
    proc.once("spawn", () => {
      clearTimeout(timer);
      console.log(`[${exe}] ${args.join(" ")}`);
      resolve({ success: true });
    });
  });
}

export async function launchPlayer(
  url: string,
  extensionOptions: string[] = [],
): Promise<PlayerResult> {
  const settings = getSettings();
  const key = settings.player || "mpv";
  const exe = resolvePlayerPath(key, settings);

  let args: string[];

  switch (key) {
    case "mpv": {
      const userArgs = parseArgs(settings.playerArgs?.mpv || "");
      args = [
        "--keep-open=yes",
        "--no-resume-playback",
        ...extensionOptions,
        ...userArgs,
        "--",
        url,
      ];
      break;
    }
    case "custom": {
      const template = settings.customPlayerArgs || "{url}";
      const tokens = parseArgs(template);
      let hasUrl = false;
      args = tokens.map((p) => {
        if (p.includes("{url}")) {
          hasUrl = true;
          return p.replaceAll("{url}", url);
        }
        return p;
      });
      if (!hasUrl) args.push(url);
      break;
    }
    default: {
      args = [url];
    }
  }

  return spawnPlayer(exe, args);
}