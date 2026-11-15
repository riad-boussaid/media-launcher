import {
  getPageThumbnail,
  isVideoLink,
  resolveVideoUrl,
  siteForHost,
} from "@/lib/sites";
import { isPlaylistUrl } from "@/lib/url";

interface SendResult {
  success: boolean;
  error?: string;
}

// MV3 content scripts inherit the page's CORS, so a direct fetch to the
// localhost server would fail preflight on every site. Route sends through
// the background worker instead, which holds the host permissions.
async function relaySendUrl(url: string): Promise<SendResult> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({
      type: "send-url",
      url,
    });
    if (
      response &&
      typeof response === "object" &&
      "success" in response &&
      typeof (response as { success: unknown }).success === "boolean"
    ) {
      return response as SendResult;
    }
    return { success: false, error: "No response from background worker" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

let btn: HTMLButtonElement | null = null;
let btnState: "idle" | "sending" | "sent" = "idle";

function buttonLabel(): string {
  return isPlaylistUrl(window.location.href)
    ? "Play playlist with Media Launcher"
    : "Play with Media Launcher";
}

function refreshButtonLabel(): void {
  if (btn && btnState === "idle") {
    btn.textContent = buttonLabel();
  }
}

const BASE_BTN_STYLE: Record<string, string> = {
  padding: "0 16px",
  height: "36px",
  border: "1px solid #555",
  borderRadius: "18px",
  background: "transparent",
  color: "#eee",
  fontSize: "14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function createButton(onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.id = "ml-btn";
  b.addEventListener("click", onClick);
  return b;
}

function injectButton(): void {
  const site = siteForHost(location.hostname);
  const container = site?.buttonContainerSelector
    ? document.querySelector<HTMLElement>(site.buttonContainerSelector)
    : null;

  if (site?.buttonContainerSelector && !container) {
    // Container not rendered yet — retry on next mutation.
    return;
  }

  const generic = !site && Boolean(document.querySelector("video"));
  if (!container && !generic) {
    if (btn) {
      btn.remove();
      btn = null;
    }
    return;
  }

  if (!btn) {
    btn = createButton(async () => {
      if (btnState === "sending" || !btn) return;
      btnState = "sending";
      btn.textContent = "Sending...";
      btn.style.opacity = "0.6";
      btn.style.pointerEvents = "none";
      const url = window.location.href;
      const result = await relaySendUrl(url);
      btn.textContent = result.success ? "Sent ✓" : "Error ✗";
      btnState = result.success ? "sent" : "idle";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      const videoId = site?.videoIdFromUrl?.(url) ?? null;
      const thumb = site ? getPageThumbnail(document) : null;
      chrome.runtime
        .sendMessage({
          type: "notify",
          success: result.success,
          error: result.error,
          videoId: videoId ?? undefined,
          thumbnailUrl: thumb ?? undefined,
        })
        .catch(() => {});
      setTimeout(() => {
        btnState = "idle";
        refreshButtonLabel();
      }, 3000);
    });
    Object.assign(btn.style, BASE_BTN_STYLE);
    if (generic) {
      Object.assign(btn.style, {
        position: "fixed",
        top: "12px",
        right: "12px",
        zIndex: "2147483647",
        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
      });
    } else {
      btn.style.marginLeft = "8px";
    }
  }

  if (container && btn.parentElement !== container) {
    container.appendChild(btn);
  } else if (generic && !btn.isConnected) {
    document.body.appendChild(btn);
  }
  refreshButtonLabel();
}

function getVideoIdFromHref(href: string): string | null {
  const site = siteForHost(location.hostname);
  if (site?.videoIdFromUrl) return site.videoIdFromUrl(href);
  return null;
}

function injectBadge(a: HTMLAnchorElement): void {
  if (a.querySelector(".ml-badge")) return;

  const badge = document.createElement("img");
  badge.className = "ml-badge";
  badge.src = chrome.runtime.getURL("play-logo.png");
  badge.alt = "Play with Media Launcher";
  Object.assign(badge.style, {
    position: "absolute",
    top: "4px",
    left: "4px",
    width: "24px",
    height: "24px",
    cursor: "pointer",
    zIndex: "10",
    opacity: "0.8",
    transition: "opacity 0.15s",
    borderRadius: "3px",
  });

  badge.addEventListener("mouseenter", () => {
    badge.style.opacity = "1";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.opacity = "0.8";
  });

  badge.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = resolveVideoUrl(a);
    if (!url) return;
    badge.style.opacity = "0.5";
    badge.style.pointerEvents = "none";
    const result = await relaySendUrl(url);
    badge.style.opacity = "0.9";
    badge.style.pointerEvents = "auto";
    const videoId = getVideoIdFromHref(url);
    chrome.runtime
      .sendMessage({
        type: "notify",
        success: result.success,
        error: result.error,
        videoId: videoId ?? undefined,
      })
      .catch(() => {});
  });

  const target = a as HTMLElement;
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }
  target.appendChild(badge);
}

const badgeDone = new Set<string>();

function injectThumbnailBadges(): void {
  const anchors = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const a of anchors) {
    if (!isVideoLink(a)) continue;
    const key = a.href;
    if (badgeDone.has(key)) continue;
    badgeDone.add(key);
    injectBadge(a);
  }
}

function injectPlaylistBadge(): void {
  const isPlaylist = isPlaylistUrl(window.location.href);
  const existing = document.querySelector<HTMLElement>(".ml-playlist-badge");
  if (!isPlaylist) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const container = document.querySelector<HTMLElement>(
    "ytd-playlist-header-renderer #avatar, ytd-playlist-header-renderer ytd-thumbnail, ytd-playlist-header-renderer .image",
  );
  if (!container) return;

  const badge = document.createElement("img");
  badge.className = "ml-playlist-badge";
  badge.src = chrome.runtime.getURL("play-logo.png");
  badge.alt = "Play playlist with Media Launcher";
  Object.assign(badge.style, {
    position: "absolute",
    bottom: "8px",
    right: "8px",
    width: "32px",
    height: "32px",
    cursor: "pointer",
    zIndex: "10",
    opacity: "0.9",
    transition: "opacity 0.15s",
    borderRadius: "6px",
    background: "#000",
    border: "1px solid rgba(255,255,255,0.3)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
  });

  badge.addEventListener("mouseenter", () => {
    badge.style.opacity = "1";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.opacity = "0.9";
  });

  badge.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    badge.style.opacity = "0.5";
    badge.style.pointerEvents = "none";
    const result = await relaySendUrl(window.location.href);
    badge.style.opacity = "0.9";
    badge.style.pointerEvents = "auto";
    chrome.runtime
      .sendMessage({
        type: "notify",
        success: result.success,
        error: result.error,
      })
      .catch(() => {});
  });

  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  container.appendChild(badge);
}

const observer = new MutationObserver(() => {
  injectButton();
  injectThumbnailBadges();
  injectPlaylistBadge();
  refreshButtonLabel();
});
observer.observe(document.body, { childList: true, subtree: true });

injectButton();
injectThumbnailBadges();
injectPlaylistBadge();
refreshButtonLabel();
