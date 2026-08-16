import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getSettings } from "./db.js";

export interface VideoMetadata {
  title: string;
  thumbnail: string;
}

function findYtDlp(binDir: string): string {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  if (binDir) {
    const local = join(binDir, name);
    if (existsSync(local)) return local;
  }
  return name;
}

export function fetchMetadata(
  url: string,
  signal?: AbortSignal,
): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const settings = getSettings();
    const ytDlpPath = findYtDlp(settings.binDir);

    const proc = spawn(
      ytDlpPath,
      [
        "--no-playlist",
        "--print",
        "%(title)s",
        "--print",
        "%(thumbnail)s",
        "--no-download",
        url,
      ],
      { stdio: ["ignore", "pipe", "ignore"], timeout: 15000 },
    );

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    const onError = (err: Error) => {
      console.error(`[metadata] yt-dlp error: ${err.message}`);
      resolve({ title: "", thumbnail: "" });
    };

    proc.on("error", onError);
    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve({ title: "", thumbnail: "" });
        return;
      }
      const lines = stdout
        .trim()
        .split("\n")
        .map((l) => l.trim());
      const title = lines[0] ?? "";
      const thumbnail = lines[lines.length - 1] ?? "";
      resolve({ title, thumbnail });
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