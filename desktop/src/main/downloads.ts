import { exec } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { accessSync, constants, rename } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

const BIN_DIR = join(app.getPath("userData"), "bin");

export interface DownloadItem {
  id: string;
  name: string;
  description: string;
  size: string;
  platform: "win32" | "darwin" | "linux" | null;
  url?: string;
  canDownload: boolean;
  installed: boolean;
  systemAvailable: boolean;
  status: "idle" | "downloading" | "done" | "error";
  error?: string;
}

interface DownloadableDef {
  id: string;
  name: string;
  description: string;
  size: string;
  platformWin32: {
    url: string;
    type: "single" | "zip" | "link";
    extract?: string;
  } | null;
  platformDarwin: {
    url: string;
    type: "single" | "zip" | "link";
    extract?: string;
  } | null;
  platformLinux: {
    url: string;
    type: "single" | "zip" | "link";
    extract?: string;
  } | null;
}

const DEFINITIONS: DownloadableDef[] = [
  {
    id: "yt-dlp",
    name: "yt-dlp",
    description:
      "Download URLs from YouTube and hundreds of other sites. Required for fetching video title and thumbnail metadata.",
    size: "~3 MB",
    platformWin32: {
      url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
      type: "single",
    },
    platformDarwin: {
      url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
      type: "single",
    },
    platformLinux: {
      url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
      type: "single",
    },
  },
  {
    id: "ffmpeg",
    name: "FFmpeg",
    description:
      "Audio/video processing. Used by yt-dlp to merge formats and download audio.",
    size: "~70 MB",
    platformWin32: {
      url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
      type: "zip",
      extract: "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe",
    },
    platformDarwin: null,
    platformLinux: null,
  },
  {
    id: "mpv",
    name: "mpv",
    description: "Lightweight media player. Portable Windows build.",
    size: "~50 MB",
    platformWin32: {
      url: "https://github.com/zhongfly/mpv-winbuild/releases/download/release%2F20250430/mpv-x86_64-20250430-7fdd781.7z",
      type: "zip",
      extract: "mpv-x86_64-20250430-7fdd781/mpv.exe",
    },
    platformDarwin: null,
    platformLinux: null,
  },
  {
    id: "iina",
    name: "IINA",
    description: "Modern media player for macOS.",
    size: "",
    platformWin32: null,
    platformDarwin: { url: "https://iina.io/", type: "link" },
    platformLinux: null,
  },
  {
    id: "potplayer",
    name: "PotPlayer",
    description: "Feature-rich media player for Windows.",
    size: "",
    platformWin32: { url: "https://potplayer.daum.net/", type: "link" },
    platformDarwin: null,
    platformLinux: null,
  },
];

function ensureBinDir() {
  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });
}

export function getBinDir(): string {
  ensureBinDir();
  return BIN_DIR;
}

export function getLocalBinaryPath(name: string): string {
  const exe =
    process.platform === "win32" && !name.endsWith(".exe")
      ? `${name}.exe`
      : name;
  const local = join(BIN_DIR, exe);
  if (existsSync(local)) {
    try {
      accessSync(local, constants.X_OK);
      return local;
    } catch {
      return local;
    }
  }
  return exe;
}

const downloadState = new Map<string, DownloadItem["status"]>();
const downloadErrors = new Map<string, string>();

async function fetchWithRedirect(url: string): Promise<Response> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res;
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  const res = await fetchWithRedirect(url);
  const total = parseInt(res.headers.get("content-length") || "0", 10);
  const reader = res.body?.getReader();
  const writer = createWriteStream(destPath);
  let received = 0;

  return new Promise((resolve, reject) => {
    writer.on("error", reject);
    writer.on("finish", resolve);

    const pump = async () => {
      try {
        const { done, value } = await reader.read();
        if (done) {
          writer.end();
          return;
        }
        received += value.length;
        writer.write(value);
        if (onProgress) onProgress(received, total);
        pump();
      } catch (err) {
        reject(err);
      }
    };
    pump();
  });
}

async function extractZip(
  zipPath: string,
  destDir: string,
  binaryInside: string,
): Promise<void> {
  const targetName = binaryInside.split("/").pop()!;
  const targetDest = join(destDir, targetName);

  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const tmpDir = join(destDir, "__extract");
      const cmd = `powershell -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force"`;
      exec(cmd, async (err) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          const extractedBinary = join(tmpDir, binaryInside);
          if (existsSync(extractedBinary)) {
            await rename(extractedBinary, targetDest);
          }
          // cleanup
          exec(
            `powershell -Command "Remove-Item -Path '${tmpDir.replace(/'/g, "''")}' -Recurse -Force"`,
          );
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      const tmpDir = join(destDir, "__extract");
      exec(
        `mkdir -p '${tmpDir}' && unzip -o '${zipPath}' -d '${tmpDir}'`,
        async (err) => {
          if (err) {
            reject(err);
            return;
          }
          try {
            const extractedBinary = join(tmpDir, binaryInside);
            if (existsSync(extractedBinary)) {
              exec(`cp '${extractedBinary}' '${targetDest}'`);
            }
            exec(`rm -rf '${tmpDir}'`);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }
}

function getDefForPlatform(
  def: DownloadableDef,
): { url: string; type: string; extract?: string } | null {
  const p = process.platform as keyof Pick<
    DownloadableDef,
    "platformWin32" | "platformDarwin" | "platformLinux"
  >;
  const key =
    `platform${p.charAt(0).toUpperCase() + p.slice(1)}` as keyof DownloadableDef;
  return (
    (def[key] as { url: string; type: string; extract?: string } | null) ?? null
  );
}

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

export function resolveSystemPath(name: string): string {
  if (existsSync(name)) return name;
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

export function checkSystemPath(binName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32" ? `where ${binName}` : `which ${binName}`;
    exec(cmd, (err) => {
      if (!err) return resolve(true);
      const paths = COMMON_PATHS[binName];
      if (paths) {
        for (const p of paths) {
          if (existsSync(p)) return resolve(true);
        }
      }
      resolve(false);
    });
  });
}

const SYSTEM_CACHE = new Map<string, boolean>();
function getSystemExeName(def: DownloadableDef): string {
  if (def.id === "yt-dlp")
    return process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  if (def.id === "mpv") return process.platform === "win32" ? "mpv.exe" : "mpv";
  if (def.id === "iina") return "iina";
  if (def.id === "potplayer") return "PotPlayerMini64";
  return def.id;
}

export async function listDownloads(): Promise<DownloadItem[]> {
  ensureBinDir();
  await Promise.all(
    DEFINITIONS.map(async (def) => {
      const name = getSystemExeName(def);
      if (!SYSTEM_CACHE.has(name)) {
        SYSTEM_CACHE.set(name, await checkSystemPath(name));
      }
    }),
  );
  return DEFINITIONS.map((def) => {
    const platform = getDefForPlatform(def);
    const exeName = getSystemExeName(def);
    const _isLinkType = platform?.type === "link";
    const installed = existsSync(join(BIN_DIR, exeName));
    const systemAvailable = SYSTEM_CACHE.get(exeName) ?? false;
    const status = downloadState.get(def.id) ?? (installed ? "done" : "idle");
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      size: def.size,
      platform: platform
        ? (process.platform as "win32" | "darwin" | "linux")
        : null,
      url: platform?.url,
      canDownload: platform?.type !== "link",
      installed,
      systemAvailable,
      status,
      error: downloadErrors.get(def.id),
    };
  });
}

export async function startDownload(id: string): Promise<void> {
  const def = DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown download: ${id}`);

  const platform = getDefForPlatform(def);
  if (!platform) throw new Error(`Not available on ${process.platform}`);

  ensureBinDir();
  downloadState.set(id, "downloading");
  downloadErrors.delete(id);

  try {
    const ext =
      platform.type === "zip"
        ? ".zip"
        : process.platform === "win32"
          ? ".exe"
          : "";
    const tempPath = join(BIN_DIR, `.${id}${ext}`);

    console.log(`[download] ${id} → ${tempPath} (${platform.url})`);
    await downloadFile(platform.url, tempPath);

    if (platform.type === "zip") {
      const extractPath = platform.extract!;
      const targetName = extractPath.split("/").pop()!;
      const targetDest = join(BIN_DIR, targetName);
      await extractZip(tempPath, BIN_DIR, extractPath);
      if (existsSync(tempPath)) unlinkSync(tempPath);
      if (existsSync(targetDest)) {
        try {
          accessSync(targetDest, constants.X_OK);
        } catch {
          /* Windows doesn't need X_OK */
        }
      }
    } else {
      const targetName =
        def.id === "yt-dlp"
          ? process.platform === "win32"
            ? "yt-dlp.exe"
            : "yt-dlp"
          : def.id;
      const targetDest = join(BIN_DIR, targetName);
      if (tempPath !== targetDest) {
        await rename(tempPath, targetDest);
      }
      if (process.platform !== "win32") {
        // make executable
        exec(`chmod +x '${targetDest}'`);
      }
    }

    downloadState.set(id, "done");
  } catch (err: any) {
    downloadState.set(id, "error");
    downloadErrors.set(id, err.message);
    console.error(`[download] ${id} failed:`, err.message);
    throw err;
  }
}

export async function deleteDownload(id: string): Promise<void> {
  const candidates: string[] = [];

  if (id === "yt-dlp") {
    candidates.push(join(BIN_DIR, "yt-dlp"));
    candidates.push(join(BIN_DIR, "yt-dlp.exe"));
  } else if (id === "ffmpeg") {
    candidates.push(join(BIN_DIR, "ffmpeg"));
    candidates.push(join(BIN_DIR, "ffmpeg.exe"));
  } else if (id === "mpv") {
    candidates.push(join(BIN_DIR, "mpv"));
    candidates.push(join(BIN_DIR, "mpv.exe"));
  }

  for (const p of candidates) {
    if (existsSync(p)) unlinkSync(p);
  }
  downloadState.set(id, "idle");
  downloadErrors.delete(id);
}
