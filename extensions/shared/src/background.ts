import {
  addServerWatchLater,
  getServerUrl,
  getServerWatchLater,
  sendUrl,
  type SendResult,
} from "@shared/api";
import { EXPECTED_SERVER_API_VERSION } from "@shared/discovery";
import { ext } from "@shared/ext";
import { getSettings, migrateAuthToken } from "@shared/settings";
import { WATCH_LATER_CACHE_KEY } from "@shared/storage-keys";
import { canonicalizeUrl } from "@shared/url";
import {
  removeLater,
  saveLater,
  type WatchLaterEntry,
} from "@shared/watch-later";

const LOGO = chrome.runtime.getURL("play-logo.png");

function successLabel(result: SendResult, queued: boolean): string {
  if (!queued) return "Sent to player";
  const count = result.queuedCount ?? 1;
  return count > 1 ? `Queued ${count} videos` : "Queued in player";
}

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

async function saveToWatchLater(url: string, title = ""): Promise<void> {
  const videoId = getYouTubeId(url);
  const thumb = videoId ? await fetchThumbnail(videoId) : undefined;
  const entry = await addServerWatchLater({ url, title });
  if (entry) {
    setTemporaryBadge("✓", "#22c55e");
    notify("Saved to Watch Later", thumb);
  } else {
    setTemporaryBadge("✗", "#ef4444");
    notify("Could not save to Watch Later — is the server running?", thumb);
  }
}

type ServerStatus = "online" | "incompatible" | "offline";

async function checkServerStatus(): Promise<ServerStatus> {
  const url = await getServerUrl();
  if (!url) return "offline";
  try {
    const res = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return "offline";
    const data = (await res.json()) as {
      app?: unknown;
      apiVersion?: unknown;
    };
    if (data.app !== "media-launcher") return "offline";
    return data.apiVersion === EXPECTED_SERVER_API_VERSION
      ? "online"
      : "incompatible";
  } catch {
    return "offline";
  }
}

async function updatePersistentBadge() {
  const status = await checkServerStatus();
  const text =
    status === "online" ? "✓" : status === "incompatible" ? "!" : "✗";
  const color =
    status === "online"
      ? "#22c55e"
      : status === "incompatible"
        ? "#f59e0b"
        : "#ef4444";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({
    title:
      status === "online"
        ? "Media Launcher server connected"
        : status === "incompatible"
          ? "Server API mismatch — update the extension and desktop app"
          : "Media Launcher server not found",
  });
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

function registerContextMenus(): void {
  // Rebuild from scratch so upgrades don't leave stale items behind or log
  // duplicate-ID errors for menus that already exist.
  chrome.contextMenus.removeAll(() => {
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
    chrome.contextMenus.create({
      id: "save-page",
      title: "Save Page to Watch Later",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "save-link",
      title: "Save Link to Watch Later",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "save-media",
      title: "Save Media to Watch Later",
      contexts: ["video", "audio"],
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // First-run onboarding: show the token setup checklist immediately.
    void ext.runtime.openOptionsPage();
  }
  registerContextMenus();

  chrome.alarms.create("check-server", { periodInMinutes: 0.5 });
  updatePersistentBadge();
});

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
  chrome.alarms.create("check-server", { periodInMinutes: 0.5 });
  updatePersistentBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check-server" || alarm.name === "revert-badge") {
    updatePersistentBadge();
  }
});

/** Server list for display; falls back to the last-known cache when offline. */
async function loadWatchLaterForDisplay(): Promise<WatchLaterEntry[] | null> {
  try {
    const entries = await getServerWatchLater();
    if (entries) return entries;
  } catch {
    // Fall through to the cache.
  }
  try {
    const cached = await ext.storage.local.get(WATCH_LATER_CACHE_KEY);
    const list = cached[WATCH_LATER_CACHE_KEY];
    return Array.isArray(list) ? (list as WatchLaterEntry[]) : null;
  } catch {
    return null;
  }
}

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
  if (msg?.type === "watch-later-status" && typeof msg.url === "string") {
    void (async () => {
      try {
        const entries = await loadWatchLaterForDisplay();
        if (!entries) {
          sendResponse({});
          return;
        }
        const canonical = canonicalizeUrl(msg.url as string);
        sendResponse({
          saved: entries.some(
            (entry) => canonicalizeUrl(entry.url) === canonical,
          ),
        });
      } catch {
        sendResponse({});
      }
    })();
    return true;
  }
  if (msg?.type === "watch-later-urls") {
    void (async () => {
      try {
        const entries = await loadWatchLaterForDisplay();
        sendResponse(
          entries ? { urls: entries.map((entry) => entry.url) } : {},
        );
      } catch {
        sendResponse({});
      }
    })();
    return true;
  }
  if (msg?.type === "toggle-watch-later" && typeof msg.url === "string") {
    void (async () => {
      try {
        const url = msg.url as string;
        const title = typeof msg.title === "string" ? msg.title : "";
        const thumbnail =
          typeof msg.thumbnail === "string" ? msg.thumbnail : "";
        const target = typeof msg.saved === "boolean" ? msg.saved : null;

        // Newer callers send the state they want, so a stale "unsaved" label
        // can never remove an existing bookmark. POST is idempotent.
        if (target === true) {
          const next = await saveLater({ url, title, thumbnail });
          sendResponse(
            next ? { success: true, saved: true } : { success: false },
          );
          return;
        }

        // Removal needs the entry id; read straight from the server instead of
        // the cache so a status check can't write an older list over it.
        const entries = await getServerWatchLater();
        if (!entries) {
          sendResponse({ success: false });
          return;
        }
        const canonical = canonicalizeUrl(url);
        const existing = entries.find(
          (entry) => canonicalizeUrl(entry.url) === canonical,
        );

        if (target === false) {
          if (!existing) {
            sendResponse({ success: true, saved: false });
            return;
          }
          const next = await removeLater(existing.id);
          sendResponse(
            next ? { success: true, saved: false } : { success: false },
          );
          return;
        }

        // Older content scripts (loaded before an extension update) don't send
        // a target; keep the original toggle behavior for them.
        if (existing) {
          const next = await removeLater(existing.id);
          sendResponse(
            next ? { success: true, saved: false } : { success: false },
          );
          return;
        }
        const next = await saveLater({ url, title, thumbnail });
        sendResponse(next ? { success: true, saved: true } : { success: false });
      } catch {
        sendResponse({ success: false });
      }
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
          const count =
            typeof msg.queuedCount === "number" ? msg.queuedCount : 1;
          notify(
            msg.queued
              ? count > 1
                ? `Queued ${count} videos`
                : "Queued in player"
              : "Sent to player",
            thumb,
          );
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
  if (
    info.menuItemId === "save-page" ||
    info.menuItemId === "save-link" ||
    info.menuItemId === "save-media"
  ) {
    const url =
      info.menuItemId === "save-page"
        ? info.pageUrl
        : info.menuItemId === "save-link"
          ? info.linkUrl
          : info.srcUrl;
    if (!url) return;
    await saveToWatchLater(url);
    return;
  }

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
    notify(successLabel(result, queue), thumb);
  } else {
    setTemporaryBadge("✗", "#ef4444");
    notify(result.error ?? "Failed", thumb);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (
    command !== "play-current-page" &&
    command !== "queue-current-page" &&
    command !== "save-current-page"
  ) {
    return;
  }
  const queue = command === "queue-current-page";
  const save = command === "save-current-page";
  void (async () => {
    const [tab] = await ext.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url;
    if (!url || !/^https?:/i.test(url)) return;
    if (save) {
      await saveToWatchLater(url);
      return;
    }
    const videoId = getYouTubeId(url);
    const thumb = videoId ? await fetchThumbnail(videoId) : undefined;
    const result = await sendUrl(url, undefined, queue);
    if (result.success) {
      setTemporaryBadge("✓", "#22c55e");
      notify(successLabel(result, queue), thumb);
    } else {
      setTemporaryBadge("✗", "#ef4444");
      notify(result.error ?? "Failed", thumb);
    }
  })();
});
