import { exec } from "child_process";
import { getLocalBinaryPath } from "./downloads";

export interface VideoMetadata {
  title: string;
  thumbnail: string;
}

export function fetchMetadata(url: string, signal?: AbortSignal): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const ytDlpPath = getLocalBinaryPath("yt-dlp");
    const proc = exec(
      `"${ytDlpPath}" --print "%(title)s" --print "%(thumbnail)s" --no-download "${url}"`,
      { shell: true, timeout: 15000 },
      (err, stdout) => {
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
