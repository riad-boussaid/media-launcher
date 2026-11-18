import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getSettings } from "./db.js";

export interface VideoMetadata {
  title: string;
  thumbnail: string;
}

// Packaged apps launched from Finder inherit a minimal PATH, so Homebrew
// locations need to be checked explicitly.
const YT_DLP_COMMON =
  process.platform === "darwin"
    ? ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"]
    : process.platform === "linux"
      ? ["/usr/bin/yt-dlp", "/usr/local/bin/yt-dlp"]
      : [];

export function findYtDlp(binDir: string): string {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  if (binDir) {
    const local = join(binDir, name);
    if (existsSync(local)) return local;
  }
  for (const candidate of YT_DLP_COMMON) {
    if (existsSync(candidate)) return candidate;
  }
  return name;
}

// Rapid replays of the same URL would otherwise pile up yt-dlp processes.
const inflight = new Map<string, Promise<VideoMetadata>>();

export function fetchMetadata(
  url: string,
  signal?: AbortSignal,
): Promise<VideoMetadata> {
  const existing = inflight.get(url);
  if (existing) return existing;
  const promise = runFetchMetadata(url, signal).finally(() =>
    inflight.delete(url),
  );
  inflight.set(url, promise);
  return promise;
}

function runFetchMetadata(
  url: string,
  signal?: AbortSignal,
): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const settings = getSettings();
    const ytDlpPath = findYtDlp(settings.binDir);

    // --print-json emits a single JSON object per video on stdout, which is
    // robust against titles containing newlines (unlike separate --print
    // fields, where line parsing breaks).
    const proc = spawn(
      ytDlpPath,
      ["--no-playlist", "--no-download", "--print-json", url],
      { stdio: ["ignore", "pipe", "ignore"], timeout: 15000 },
    );

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("error", (err) => {
      console.error(`[metadata] yt-dlp error: ${err.message}`);
      resolve({ title: "", thumbnail: "" });
    });

    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve({ title: "", thumbnail: "" });
        return;
      }
      const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const obj = JSON.parse(lines[i]) as Record<string, unknown>;
          const title = typeof obj.title === "string" ? obj.title : "";
          const thumbnail =
            typeof obj.thumbnail === "string" ? obj.thumbnail : "";
          if (title || thumbnail) {
            resolve({ title, thumbnail });
            return;
          }
        } catch {
          // Not JSON (e.g. a warning leaked to stdout) — keep scanning.
        }
      }
      resolve({ title: "", thumbnail: "" });
    });

    if (signal) {
      const abortHandler = () => proc.kill();
      signal.addEventListener("abort", abortHandler, { once: true });
      proc.once("close", () => {
        signal.removeEventListener("abort", abortHandler);
      });
    }
  });
}
