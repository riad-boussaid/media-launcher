import { getServerUrl, sendUrl } from "@/lib/api";

const LOGO = chrome.runtime.getURL("mpv-logo.png");

function getYouTubeId(u: string): string | null {
  const m = u.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

async function fetchThumbnail(videoId: string): Promise<string> {
  const sizes = ["maxresdefault", "hqdefault", "mqdefault"];
  for (const size of sizes) {
    try {
      const res = await fetch(
        `https://img.youtube.com/vi/${videoId}/${size}.jpg`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!res.ok) continue;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
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
  setTimeout(updatePersistentBadge, 3000);
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

  chrome.alarms.create("check-server", { periodInMinutes: 0.25 });
  updatePersistentBadge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("check-server", { periodInMinutes: 0.25 });
  updatePersistentBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check-server") updatePersistentBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg === "check-server") {
    updatePersistentBadge();
    sendResponse();
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
