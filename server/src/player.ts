import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir, getSettings } from "./db.js";

// Split a user-supplied command-line string into argv tokens. Shell-like
// quoting only: an unclosed quote keeps the quote character in the token.
function parseArgs(str: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (;;) {
    const m = re.exec(str);
    if (m === null) break;
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

// Common per-OS install locations for players that don't register on PATH
// (PotPlayer installs to Program Files with no PATH entry). Mirrors the table
// in the desktop app's player.ts.
const COMMON_PATHS: Record<string, string[]> = {
  PotPlayerMini64: [
    "C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe",
    "C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini64.exe",
  ],
  "PotPlayerMini64.exe": [
    "C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe",
    "C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini64.exe",
  ],
  ffmpeg: [
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
  ],
  "ffmpeg.exe": [
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
  ],
  iina: ["/Applications/IINA.app/Contents/MacOS/iina"],
  mpv: ["/usr/bin/mpv", "/usr/local/bin/mpv"],
};

function lookupCommonPath(name: string): string | null {
  const keys = [
    name,
    process.platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : "",
  ].filter(Boolean);
  for (const key of keys) {
    for (const p of COMMON_PATHS[key] ?? []) {
      if (existsSync(p)) return p;
    }
  }
  return null;
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
  const common = lookupCommonPath(name);
  if (common) return common;
  return name;
}

export interface LaunchResult {
  success: boolean;
  error?: string;
  /** The spawned process — only set for mpv (the player with IPC support). */
  proc?: ChildProcess;
  pipePath?: string;
}

function spawnPlayer(
  exe: string,
  args: string[],
  timeoutMs = 10000,
): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const proc = spawn(exe, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: `Timed out launching ${exe}` });
    }, timeoutMs);

    proc.once("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const message =
        err.code === "ENOENT"
          ? `${exe} was not found. Install it, download it from Settings → Downloads, or point the app to its executable with a custom player.`
          : err.message;
      resolve({
        success: false,
        error: `Failed to launch ${exe}: ${message}`,
      });
    });
    proc.once("spawn", () => {
      clearTimeout(timer);
      console.log(`[${exe}] ${args.join(" ")}`);
      resolve({ success: true, proc });
    });
  });
}

// Unique per launch so concurrent mpv instances never collide, and so user
// mpv processes with their own IPC sockets are never touched.
function makeIpcPipePath(): string {
  const unique = `${process.pid}-${Date.now()}`;
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\media-launcher-${unique}`;
  }
  return join(getDataDir(), `mpv-${unique}.sock`);
}

export async function launchPlayer(
  url: string,
  extensionOptions: string[] = [],
): Promise<LaunchResult> {
  const settings = getSettings();
  const key = settings.player || "mpv";
  const exe = resolvePlayerPath(key, settings);

  let args: string[];
  let pipePath: string | undefined;

  switch (key) {
    case "mpv": {
      pipePath = makeIpcPipePath();
      const userArgs = parseArgs(settings.playerArgs?.mpv || "");
      // SponsorBlock script (downloaded via the desktop's Downloads section)
      // is loaded automatically when present.
      const sponsorblockPath = join(
        getBinDir(settings.binDir),
        "sponsorblock.lua",
      );
      const scriptArgs = existsSync(sponsorblockPath)
        ? [`--script=${sponsorblockPath}`]
        : [];
      args = [
        "--keep-open=yes",
        "--no-resume-playback",
        // Start playing immediately, even if the user's mpv.conf says pause.
        // User args come last and can still override.
        "--pause=no",
        `--input-ipc-server=${pipePath}`,
        ...scriptArgs,
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

  const result = await spawnPlayer(exe, args);
  return { ...result, pipePath: result.success ? pipePath : undefined };
}
