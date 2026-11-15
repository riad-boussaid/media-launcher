import { discoverServer } from "@shared/discovery";
import { defaultSettings } from "@shared/settings";
import { getStartSeconds } from "@shared/url";

let cachedServerUrl: string | null = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.serverUrl) {
    cachedServerUrl = null;
  }
});

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

async function getAuthToken(): Promise<string> {
  const opts = await chrome.storage.sync.get(defaultSettings);
  return typeof opts.authToken === "string" ? opts.authToken : "";
}

const CODEC_PREFIXES: Record<string, string[]> = {
  h264: ["avc1"],
  vp9: ["vp09"],
  av1: ["av01"],
  h265: ["hvc1", "hev1"],
};

export async function sendUrl(url: string): Promise<SendResult> {
  const opts = await chrome.storage.sync.get(defaultSettings);
  const mpvArgs: string[] = [];

  if (opts.maxHeight === "a") {
    mpvArgs.push("--ytdl-format=ba");
    if (opts.showThumb) {
      mpvArgs.push("--script-opts=ytdl_hook-thumbnails=best");
    }
  } else {
    const base = `bestvideo[height<=${opts.maxHeight}]+bestaudio`;
    const prefixes =
      opts.codec && opts.codec !== "any" ? CODEC_PREFIXES[opts.codec] : null;
    if (prefixes) {
      const selectors = prefixes.map(
        (p) => `bestvideo[height<=${opts.maxHeight}][vcodec^=${p}]+bestaudio`,
      );
      mpvArgs.push(`--ytdl-format=${selectors.join("/")}/${base}/best`);
    } else {
      mpvArgs.push(`--ytdl-format=${base}/best`);
    }
  }

  // Auto flags come before custom args so the user's extra MPV arguments win
  // (mpv uses last-flag-wins).
  if (opts.volume !== 100) mpvArgs.push(`--volume=${opts.volume}`);
  if (opts.speed !== 1) mpvArgs.push(`--speed=${opts.speed}`);
  if (opts.subLang) mpvArgs.push(`--sub-lang=${opts.subLang}`);
  if (opts.loop) mpvArgs.push("--loop-file=inf");
  const start = getStartSeconds(url);
  if (start !== null) mpvArgs.push(`--start=${start}`);

  const customArgs = opts.mpvArgs
    ? opts.mpvArgs.split(/\r?\n/).filter(Boolean)
    : [];
  mpvArgs.push(...customArgs);

  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    return { success: false, error: "Server not found. Check options." };
  }

  try {
    const token = await getAuthToken();
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, options: mpvArgs }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401) {
      return {
        success: false,
        error: "Unauthorized — paste the server token in options.",
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `Server error: ${res.status}${text ? ` - ${text}` : ""}`,
      };
    }

    return { success: true };
  } catch (error) {
    // The cached server URL is stale — clear it so the next call re-discovers.
    cachedServerUrl = null;
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
