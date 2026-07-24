import { discoverServer } from "@/lib/discovery";
import { defaultSettings } from "@/lib/settings";

let cachedServerUrl: string | null = null;

export async function getServerUrl(): Promise<string | null> {
  if (cachedServerUrl) return cachedServerUrl;

  const opts = await chrome.storage.sync.get(defaultSettings);
  const preferredUrl =
    opts.serverUrl !== defaultSettings.serverUrl ? opts.serverUrl : undefined;

  const result = await discoverServer(preferredUrl);
  if (result) {
    cachedServerUrl = result.serverUrl;
    if (opts.serverUrl === defaultSettings.serverUrl) {
      await chrome.storage.sync.set({ serverUrl: result.serverUrl });
    }
    return result.serverUrl;
  }

  return opts.serverUrl;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

export async function checkServerHealth(): Promise<boolean> {
  const url = await getServerUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendUrl(url: string): Promise<SendResult> {
  const opts = await chrome.storage.sync.get(defaultSettings);
  const mpvArgs: string[] = [];

  if (opts.maxHeight === "a") {
    mpvArgs.push("--ytdl-format=ba");
    if (opts.showThumb) {
      mpvArgs.push("--script-opts=ytdl_hook-thumbnails=best");
    }
  } else {
    mpvArgs.push(
      `--ytdl-format=bestvideo[height<=${opts.maxHeight}]+bestaudio`,
    );
  }

  const customArgs = opts.mpvArgs
    ? opts.mpvArgs.split(/\r?\n/).filter(Boolean)
    : [];
  mpvArgs.push(...customArgs);

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    return { success: false, error: "Server not found. Check options." };
  }

  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, options: mpvArgs }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `Server error: ${res.status}${text ? ` - ${text}` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        success: false,
        error: "Request timed out. Is the server running?",
      };
    }
    return {
      success: false,
      error: `Connection failed: ${(error as Error).message}`,
    };
  }
}
