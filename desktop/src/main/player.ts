import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

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
  mpv: [
    "/usr/bin/mpv",
    "/usr/local/bin/mpv",
    // Apple Silicon Homebrew. Packaged apps launched from Finder inherit a
    // minimal PATH, so `which mpv` alone misses this.
    "/opt/homebrew/bin/mpv",
  ],
};

function checkCommonPaths(name: string): boolean {
  const lookup = [
    name,
    process.platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : "",
  ].filter(Boolean);
  for (const key of lookup) {
    const paths = COMMON_PATHS[key];
    if (paths) {
      for (const p of paths) {
        if (existsSync(p)) return true;
      }
    }
  }
  return false;
}

export function checkPlayerExists(exe: string): Promise<boolean> {
  if (!exe) return Promise.resolve(false);
  if (existsSync(exe)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFile(cmd, [exe], (err) => {
      if (!err) return resolve(true);
      resolve(checkCommonPaths(exe));
    });
  });
}
