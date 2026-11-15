import { getServerUrl, sendUrl } from "@/lib/api";

const LOGO = chrome.runtime.getURL("play-logo.png");

function getYouTubeId(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.hostname === "youtu.be") {
      return url.pathname.slice(1).match(/^[a-zA-Z0-9_-]{11}/)?.[0] ?? null;
    }
    if (
      url.hostname === "youtube.com" ||
      url.hostname.endsWith(".youtube.com")
    ) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const m = url.pathname.match(/^\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      return m?.[2] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function imageToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read error"));
    r.readAsDataURL(blob);
  });
}

async function fetchThumbnail(videoId: string): Promise<string> {
  const sizes = ["maxresdefault", "hqdefault", "mqdefault"];
  for (const size of sizes) {
    try {
      return await imageToDataUrl(
        `https://img.youtube.com/vi/${videoId}/${size}.jpg`,
      );
    } catch {}
  }
  return LOGO;
}

async function notify(message: string, thumbnailUrl?: string) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: thumbnailUrl ?? LOGO,
      title: "media-launcher",
      message,
    });
  } catch (err) {
    console.error("notification error:", err);
  }
}

async function checkServerStatus(): Promise<boolean> {
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

async function updatePersistentBadge() {
  const ok = await checkServerStatus();
  chrome.action.setBadgeText({ text: ok ? "✓" : "✗" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#22c55e" : "#ef4444" });
}

function setTemporaryBadge(text: string, color: string) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  // setTimeout does not reliably keep an MV3 service worker alive, so use a
  // one-shot alarm to revert the badge.
  chrome.alarms.create("revert-badge", { when: Date.now() + 3000 });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "play-page",
    title: "Play Page with Media Launcher",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "play-link",
    title: "Play Link with Media Launcher",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "play-media",
    title: "Play Media with Media Launcher",
    contexts: ["video", "audio"],
  });

  chrome.alarms.create("check-server", { periodInMinutes: 0.5 });
  updatePersistentBadge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("check-server", { periodInMinutes: 0.5 });
  updatePersistentBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check-server" || alarm.name === "revert-badge") {
    updatePersistentBadge();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg === "check-server") {
    updatePersistentBadge();
    sendResponse();
    return undefined;
  }
  if (msg?.type === "send-url" && typeof msg.url === "string") {
    // Content scripts must not fetch the server directly: in MV3 their
    // requests are subject to the page's CORS and would fail preflight.
    // Relay through the background worker, which has host permissions.
    void (async () => {
      const result = await sendUrl(msg.url as string);
      sendResponse(result);
    })();
    return true;
  }
  if (msg?.type === "notify") {
    void (async () => {
      try {
        let thumb: string | undefined;
        if (typeof msg.thumbnailUrl === "string" && msg.thumbnailUrl) {
          try {
            thumb = await imageToDataUrl(msg.thumbnailUrl);
          } catch {
            thumb = undefined;
          }
        } else if (typeof msg.videoId === "string" && msg.videoId) {
          thumb = await fetchThumbnail(msg.videoId);
        }
        if (msg.success) {
          setTemporaryBadge("✓", "#22c55e");
          notify("Sent to player", thumb);
        } else {
          setTemporaryBadge("✗", "#ef4444");
          notify(msg.error ?? "Failed", thumb);
        }
        sendResponse();
      } catch {
        sendResponse();
      }
    })();
    return true;
  }
  return undefined;
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  let url: string | undefined;
  if (info.menuItemId === "play-page") url = info.pageUrl;
  else if (info.menuItemId === "play-link") url = info.linkUrl;
  else if (info.menuItemId === "play-media") url = info.srcUrl;
  if (!url) return;
  const videoId = getYouTubeId(url);
  const thumb = videoId ? await fetchThumbnail(videoId) : undefined;
  const result = await sendUrl(url);
  if (result.success) {
    setTemporaryBadge("✓", "#22c55e");
    notify("Sent to player", thumb);
  } else {
    setTemporaryBadge("✗", "#ef4444");
    notify(result.error ?? "Failed", thumb);
  }
});
