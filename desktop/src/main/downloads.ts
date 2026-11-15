import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { chmod, rename } from "node:fs/promises";
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
  /** 0..1 when the content length is known, -1 for indeterminate, null otherwise. */
  progress: number | null;
  error?: string;
}

interface ChecksumSpec {
  /** Checksum list with "<sha256>  <fileName>" lines. */
  url: string;
  /** Asset name to look up inside the list (defaults to the download's basename). */
  fileName?: string;
}

interface ResolvedSource {
  url: string;
  extract?: string;
  checksum?: ChecksumSpec;
}

interface PlatformSource {
  /** Static download URL; omitted when a resolver supplies it at download time. */
  url?: string;
  type: "single" | "zip" | "link";
  extract?: string;
  checksum?: ChecksumSpec;
  /** Resolve URL/checksum/extract at download time for moving releases. */
  resolver?: () => Promise<ResolvedSource>;
}

interface DownloadableDef {
  id: string;
  name: string;
  description: string;
  size: string;
  platformWin32: PlatformSource | null;
  platformDarwin: PlatformSource | null;
  platformLinux: PlatformSource | null;
}

const YT_DLP_CHECKSUM =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
const FFMPEG_CHECKSUM =
  "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256";

// zhongfly rotates mpv-winbuild releases daily and deletes old tags, so the
// asset URL, its archive layout and its checksum all resolve at download time
// from the release API instead of a pinned URL that rots (the old pinned
// release already 404s).
async function resolveMpvWinbuild(): Promise<ResolvedSource> {
  const res = await fetch(
    "https://api.github.com/repos/zhongfly/mpv-winbuild/releases/latest",
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "media-launcher",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) {
    throw new Error(`mpv release lookup failed: HTTP ${res.status}`);
  }
  const release = (await res.json()) as {
    assets?: { name: string; browser_download_url: string }[];
  };
  const asset = release.assets?.find((a) =>
    /^mpv-x86_64-\d{8}-[0-9a-f]+\.7z$/.test(a.name),
  );
  if (!asset) {
    throw new Error("No mpv-x86_64 asset in latest mpv-winbuild release");
  }
  // The archive unpacks into a folder named after the asset.
  const stem = asset.name.replace(/\.7z$/, "");
  const sha = release.assets?.find((a) => a.name === "sha256.txt");
  return {
    url: asset.browser_download_url,
    extract: `${stem}/mpv.exe`,
    checksum: sha
      ? { url: sha.browser_download_url, fileName: asset.name }
      : undefined,
  };
}

const DEFINITIONS: DownloadableDef[] = [
  {
    id: "yt-dlp",
    name: "yt-dlp",
    description:
      "Download URLs from YouTube and hundreds of other sites. Required for fetching video title and thumbnail metadata.",
    size: "~20 MB",
    platformWin32: {
      url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
      type: "single",
      checksum: { url: YT_DLP_CHECKSUM, fileName: "yt-dlp.exe" },
    },
    platformDarwin: {
      url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
      type: "single",
      checksum: { url: YT_DLP_CHECKSUM, fileName: "yt-dlp" },
    },
    platformLinux: {
      url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
      type: "single",
      checksum: { url: YT_DLP_CHECKSUM, fileName: "yt-dlp" },
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
      checksum: {
        url: FFMPEG_CHECKSUM,
        fileName: "ffmpeg-master-latest-win64-gpl.zip",
      },
    },
    platformDarwin: null,
    platformLinux: null,
  },
  {
    id: "mpv",
    name: "mpv",
    description: "Lightweight media player. Portable Windows build.",
    size: "~30 MB",
    platformWin32: {
      url: "https://github.com/zhongfly/mpv-winbuild/releases/latest",
      type: "zip",
      resolver: resolveMpvWinbuild,
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

const downloadState = new Map<string, DownloadItem["status"]>();
const downloadErrors = new Map<string, string>();
const downloadProgress = new Map<string, { received: number; total: number }>();

async function fetchWithRedirect(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  const res = await fetch(url, { redirect: "follow", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res;
}

async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const res = await fetchWithRedirect(url, controller.signal);
    const total = parseInt(res.headers.get("content-length") || "0", 10);
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Response has no body");
    }
    const writer = createWriteStream(destPath);
    let received = 0;

    await new Promise<void>((resolve, reject) => {
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
          const ok = writer.write(value);
          if (!ok) {
            await new Promise<void>((r) => writer.once("drain", r));
          }
          if (onProgress) onProgress(received, total);
          void pump();
        } catch (err) {
          writer.destroy(err as Error);
          reject(err);
        }
      };
      void pump();
    });
  } finally {
    clearTimeout(timer);
  }
}

async function extractArchive(
  archivePath: string,
  destDir: string,
  binaryInside: string,
): Promise<void> {
  const targetName = binaryInside.split("/").pop();
  if (!targetName) throw new Error("Missing target name in extract path");
  const targetDest = join(destDir, targetName);
  const tmpDir = join(destDir, "__extract");

  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const is7z = /\.7z$/i.test(archivePath);

  if (process.platform === "win32") {
    // Windows 10+ ships bsdtar (tar.exe) which handles both zip and 7z.
    await new Promise<void>((resolve, reject) => {
      execFile(
        "tar",
        ["-xf", archivePath, "-C", tmpDir],
        { windowsHide: true },
        (err) => {
          if (err && !is7z) {
            // Fall back to PowerShell Expand-Archive for zips if tar fails.
            execFile(
              "powershell",
              [
                "-NoProfile",
                "-Command",
                `Expand-Archive -LiteralPath "${archivePath.replace(/"/g, '""')}" -DestinationPath "${tmpDir.replace(/"/g, '""')}" -Force`,
              ],
              { windowsHide: true },
              (psErr) => {
                if (psErr) return reject(psErr);
                resolve();
              },
            );
            return;
          }
          if (err) return reject(err);
          resolve();
        },
      );
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      execFile("unzip", ["-o", archivePath, "-d", tmpDir], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  const extractedBinary = join(tmpDir, binaryInside);
  if (!existsSync(extractedBinary)) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`Extracted binary not found: ${binaryInside}`);
  }

  await rename(extractedBinary, targetDest);
  rmSync(tmpDir, { recursive: true, force: true });
}

function findChecksumInSums(sums: string, fileName: string): string | null {
  for (const line of sums.split("\n")) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!m) continue;
    if (m[2].trim() === fileName) return m[1].toLowerCase();
  }
  return null;
}

// Fail-closed: a download without a verifiable checksum is an error, not a
// warning — these binaries get executed.
async function verifyChecksum(
  filePath: string,
  spec: ChecksumSpec,
): Promise<void> {
  const res = await fetch(spec.url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new Error(`Checksum list unavailable: HTTP ${res.status}`);
  }
  const fileName =
    spec.fileName ?? spec.url.split("?")[0].split("/").pop() ?? "";
  const expected = findChecksumInSums(await res.text(), fileName);
  if (!expected) {
    throw new Error(`No checksum entry for ${fileName}`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  const actual = hash.digest("hex");
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${fileName}: expected ${expected}, got ${actual}`,
    );
  }
}

function getDefForPlatform(def: DownloadableDef): PlatformSource | null {
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

export function checkSystemPath(binName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFile(cmd, [binName], (err) => {
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
  const win = process.platform === "win32";
  if (def.id === "yt-dlp") return win ? "yt-dlp.exe" : "yt-dlp";
  if (def.id === "mpv") return win ? "mpv.exe" : "mpv";
  if (def.id === "ffmpeg") return win ? "ffmpeg.exe" : "ffmpeg";
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
    const installed = existsSync(join(BIN_DIR, exeName));
    const systemAvailable = SYSTEM_CACHE.get(exeName) ?? false;
    const status = downloadState.get(def.id) ?? (installed ? "done" : "idle");
    const prog = downloadProgress.get(def.id);
    const progress =
      status === "downloading"
        ? prog && prog.total > 0
          ? prog.received / prog.total
          : -1
        : null;
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
      progress,
      error: downloadErrors.get(def.id),
    };
  });
}

export async function startDownload(id: string): Promise<void> {
  const def = DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown download: ${id}`);

  if (downloadState.get(id) === "downloading") {
    throw new Error(`Download ${id} already in progress`);
  }

  const platform = getDefForPlatform(def);
  if (!platform) throw new Error(`Not available on ${process.platform}`);

  ensureBinDir();
  downloadState.set(id, "downloading");
  downloadErrors.delete(id);
  downloadProgress.delete(id);

  let tempPath = "";
  try {
    // Moving releases resolve their URL/checksum/extract at download time.
    const source: ResolvedSource = platform.resolver
      ? await platform.resolver()
      : platform;
    if (!source.url) throw new Error(`No download URL for ${id}`);

    // Derive the archive extension from the actual URL (the mpv artifact is a
    // .7z even though it's handled by the same zip extraction path).
    const urlName = source.url.split("?")[0].split("/").pop() ?? "";
    const urlExt = urlName.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
    const ext =
      platform.type === "zip"
        ? urlExt || ".zip"
        : process.platform === "win32"
          ? ".exe"
          : "";
    tempPath = join(BIN_DIR, `.${id}${ext}`);

    console.log(`[download] ${id} → ${tempPath} (${source.url})`);
    await downloadFile(source.url, tempPath, (received, total) =>
      downloadProgress.set(id, { received, total }),
    );
    downloadProgress.delete(id);
    if (source.checksum) {
      await verifyChecksum(tempPath, source.checksum);
      console.log(`[download] ${id} checksum verified`);
    }

    if (platform.type === "zip") {
      const extractPath = source.extract ?? platform.extract;
      if (!extractPath) throw new Error(`No extract path for ${id}`);
      const targetName = extractPath.split("/").pop();
      if (!targetName) throw new Error(`No target name for ${id}`);
      const targetDest = join(BIN_DIR, targetName);
      await extractArchive(tempPath, BIN_DIR, extractPath);
      if (existsSync(tempPath)) unlinkSync(tempPath);
      if (process.platform !== "win32") {
        try {
          await chmod(targetDest, 0o755);
        } catch {
          /* best-effort */
        }
      }
    } else {
      const targetName = getSystemExeName(def);
      const targetDest = join(BIN_DIR, targetName);
      if (tempPath !== targetDest) {
        await rename(tempPath, targetDest);
      }
      if (process.platform !== "win32") {
        try {
          await chmod(targetDest, 0o755);
        } catch {
          /* best-effort */
        }
      }
    }

    downloadState.set(id, "done");
  } catch (err: unknown) {
    downloadProgress.delete(id);
    if (tempPath && existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* best-effort cleanup */
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    downloadState.set(id, "error");
    downloadErrors.set(id, message);
    console.error(`[download] ${id} failed:`, message);
    throw err;
  }
}

export async function deleteDownload(id: string): Promise<void> {
  if (downloadState.get(id) === "downloading") {
    throw new Error(`Cannot delete ${id} while downloading`);
  }
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
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to remove ${p}: ${message}`);
      }
    }
  }
  // Clean up any leftover temp/extract artifacts (including names used by
  // older versions)
  for (const f of [
    "__extract",
    ".yt-dlp.zip",
    ".yt-dlp.exe",
    ".yt-dlp",
    ".ffmpeg.zip",
    ".mpv.zip",
    ".mpv.7z",
  ]) {
    const p = join(BIN_DIR, f);
    if (existsSync(p)) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }
  downloadState.set(id, "idle");
  downloadErrors.delete(id);
}
