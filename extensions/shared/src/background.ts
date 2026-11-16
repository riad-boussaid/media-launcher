import { getServerUrl, sendUrl } from "@shared/api";
import { ext } from "@shared/ext";
import { getSettings, migrateAuthToken } from "@shared/settings";

const LOGO = chrome.runtime.getURL("play-logo.png");

// Move a legacy sync-stored API token into local storage as soon as the
// background context starts, so it stops syncing across devices.
void migrateAuthToken().catch((err) => {
  console.error("auth token migration failed:", err);
});

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
    const settings = await getSettings();
    if (!settings.notifications) return;
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

// While the side panel is open, the toolbar icon focuses the panel instead of
// opening the popup. Chrome exposes no sidePanel.isOpen(), so the panel page
// syncs its visibility directly into storage.session and flips the action
// target: empty popup -> onClicked fires (focus panel), popup path restored
// when the panel hides. Keys here must match the panel page (Popup.tsx).
const SIDEBAR_FLAG_PREFIX = "sidebar-open:";

async function setIconTarget(target: "sidebar" | "popup"): Promise<void> {
  await chrome.action.setPopup({
    popup: target === "sidebar" ? "" : "popup.html",
  });
}

const hasSidePanel = typeof chrome.sidePanel !== "undefined";

if (hasSidePanel) {
  chrome.action.onClicked.addListener((tab) => {
    void (async () => {
      const key = SIDEBAR_FLAG_PREFIX + tab.windowId;
      const flag = await chrome.storage.session.get(key);
      if (flag[key]) {
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          return;
        } catch {
          // Panel may have closed without a pagehide event — fall through.
          await chrome.storage.session.remove(key);
          await setIconTarget("popup");
          return;
        }
      }
      // Stale icon target without a flag: restore the popup for next click.
      await setIconTarget("popup");
    })();
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // First-run onboarding: show the token setup checklist immediately.
    void ext.runtime.openOptionsPage();
  }
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
  chrome.contextMenus.create({
    id: "queue-page",
    title: "Queue Page with Media Launcher",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "queue-link",
    title: "Queue Link with Media Launcher",
    contexts: ["link"],
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
      const result = await sendUrl(
        msg.url as string,
        undefined,
        msg.queue === true,
      );
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
          notify(msg.queued ? "Queued in player" : "Sent to player", thumb);
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
  let queue = false;
  if (info.menuItemId === "play-page") {
    url = info.pageUrl;
  } else if (info.menuItemId === "queue-page") {
    url = info.pageUrl;
    queue = true;
  } else if (info.menuItemId === "play-link") {
    url = info.linkUrl;
  } else if (info.menuItemId === "queue-link") {
    url = info.linkUrl;
    queue = true;
  } else if (info.menuItemId === "play-media") {
    url = info.srcUrl;
  }
  if (!url) return;
  const videoId = getYouTubeId(url);
  const thumb = videoId ? await fetchThumbnail(videoId) : undefined;
  const result = await sendUrl(url, undefined, queue);
  if (result.success) {
    setTemporaryBadge("✓", "#22c55e");
    notify(queue ? "Queued in player" : "Sent to player", thumb);
  } else {
    setTemporaryBadge("✗", "#ef4444");
    notify(result.error ?? "Failed", thumb);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "play-current-page" && command !== "queue-current-page") {
    return;
  }
  const queue = command === "queue-current-page";
  void (async () => {
    const [tab] = await ext.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url;
    if (!url || !/^https?:/i.test(url)) return;
    const videoId = getYouTubeId(url);
    const thumb = videoId ? await fetchThumbnail(videoId) : undefined;
    const result = await sendUrl(url, undefined, queue);
    if (result.success) {
      setTemporaryBadge("✓", "#22c55e");
      notify(queue ? "Queued in player" : "Sent to player", thumb);
    } else {
      setTemporaryBadge("✗", "#ef4444");
      notify(result.error ?? "Failed", thumb);
    }
  })();
});
