import { exec } from "node:child_process";
import { existsSync } from "node:fs";

function _resolveSystemPath(name: string): string {
  if (existsSync(name)) return name;
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
  const lookup = [
    name,
    process.platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : "",
  ].filter(Boolean);
  for (const key of lookup) {
    const paths = COMMON_PATHS[key];
    if (paths) {
      for (const p of paths) {
        if (existsSync(p)) return p;
      }
    }
  }
  return name;
}

export function checkPlayerExists(exe: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? `where ${exe}` : `which ${exe}`;
    exec(cmd, (err) => {
      if (!err) return resolve(true);
      const paths = COMMON_PATHS[exe];
      if (paths) {
        for (const p of paths) {
          if (existsSync(p)) return resolve(true);
        }
      }
      resolve(false);
    });
  });
}
