import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
    const ytDlpPath = findYtDlp("");

    const proc = exec(
      `"${ytDlpPath}" --print "%(title)s" --print "%(thumbnail)s" --no-download "${url}"`,
      {
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
        timeout: 15000,
      },
      (err: Error | null, stdout: string) => {
        if (err || !stdout) {
          resolve({ title: "", thumbnail: "" });
          return;
        }
        const lines = stdout.trim().split("\n");
        const title = lines[0]?.trim() ?? "";
        const thumbnail = lines[1]?.trim() ?? "";
        resolve({ title, thumbnail });
      },
    );

    if (signal) {
      signal.addEventListener("abort", () => proc.kill());
    }
  });
}
