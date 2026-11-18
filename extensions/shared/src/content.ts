import {
  type ActionButton,
  type ActionButtonVariant,
  createActionButton,
} from "@shared/action-button";
import { ext } from "@shared/ext";
import { getPageThumbnail, resolveVideoUrl, siteForHost } from "@shared/sites";
import { getSettings } from "@shared/settings";
import { isPlaylistUrl } from "@shared/url";

// The hostname is fixed for the lifetime of a content script, so resolve the
// site definition once instead of per mutation / per anchor.
const PAGE_SITE = siteForHost(location.hostname);

interface SendResult {
  success: boolean;
  error?: string;
  queuedCount?: number;
  playlistTitle?: string;
}

// MV3 content scripts inherit the page's CORS, so a direct fetch to the
// localhost server would fail preflight on every site. Route sends through
// the background worker instead, which holds the host permissions.
async function relaySendUrl(
  url: string,
  queue = false,
): Promise<SendResult> {
  try {
    const response: unknown = await ext.runtime.sendMessage({
      type: "send-url",
      url,
      queue,
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

let btn: ActionButton | null = null;

let uiReady = false;
let showPageButton = true;
let showThumbButtons = true;

async function loadUiSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    showPageButton = settings.showPageButton;
    showThumbButtons = settings.showThumbButtons;
  } catch {
    // Storage may be unavailable in a stale content script; keep defaults.
    showPageButton = true;
    showThumbButtons = true;
  }
  uiReady = true;
}

function removeMainButton(): void {
  btn?.destroy();
  btn = null;
}

function removePlaylistBadge(): void {
  document.querySelector<HTMLElement>(".ml-playlist-badge")?.remove();
}

function clearThumbnailBadges(): void {
  for (const anchor of [...badgePlacements.keys()]) {
    detachThumbnailButton(anchor);
  }
  for (const anchor of observedAnchors) {
    badgeObserver.unobserve(anchor);
  }
  observedAnchors.clear();
  pendingAnchorRoots.clear();
  lastFullBadgeScan = 0;
}

const SHORTS_CHANNEL_BAR = "yt-reel-channel-bar-view-model";

function isShortsPlayerPage(): boolean {
  return PAGE_SITE?.id === "youtube" && location.pathname.startsWith("/shorts/");
}

function buttonLabel(): string {
  if (isShortsPlayerPage()) return "Play";
  return isPlaylistUrl(window.location.href)
    ? "Play playlist with Media Launcher"
    : "Play with Media Launcher";
}

function refreshButtonLabel(): void {
  btn?.setLabel(buttonLabel());
}

// Many pages ship off-screen / zero-sized <video> elements for widgets and
// previews (e.g. Bing's search-by-image camera). Only fall back to the floating
// button when a real video is actually rendered on the page.
const MIN_GENERIC_VIDEO_WIDTH = 320;
const MIN_GENERIC_VIDEO_HEIGHT = 180;

function hasVisibleVideo(): boolean {
  for (const video of document.querySelectorAll<HTMLVideoElement>("video")) {
    if (!video.currentSrc && !video.src && !video.querySelector("source[src]")) {
      continue;
    }
    const rect = video.getBoundingClientRect();
    if (
      rect.width < MIN_GENERIC_VIDEO_WIDTH ||
      rect.height < MIN_GENERIC_VIDEO_HEIGHT
    ) {
      continue;
    }
    const style = getComputedStyle(video);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function injectButton(): void {
  const site = PAGE_SITE;
  const onShorts = isShortsPlayerPage();
  const containerSelector = onShorts
    ? SHORTS_CHANNEL_BAR
    : (site?.buttonContainerSelector ?? null);
  const container = containerSelector
    ? document.querySelector<HTMLElement>(containerSelector)
    : null;

  if (containerSelector && !container) {
    // Container not rendered yet — retry on next mutation.
    return;
  }

  const floating = !site && hasVisibleVideo() ? "floating" : null;
  if (!container && !floating) {
    btn?.destroy();
    btn = null;
    return;
  }

  const targetVariant: ActionButtonVariant = onShorts
    ? "compact"
    : (floating ?? "inline");

  if (btn && btn.variant !== targetVariant) {
    btn.destroy();
    btn = null;
  }

  if (!btn) {
    btn = createActionButton({
      variant: targetVariant,
      label: buttonLabel(),
      ariaLabel: onShorts ? "Play with Media Launcher" : undefined,
      onActivate: async ({ queue }) => {
        const url = window.location.href;
        const result = await relaySendUrl(url, queue);
        const videoId = site?.videoIdFromUrl?.(url) ?? null;
        const thumb = site ? getPageThumbnail(document) : null;
        ext.runtime
          .sendMessage({
            type: "notify",
            success: result.success,
            error: result.error,
            queued: queue,
            queuedCount: result.queuedCount,
            videoId: videoId ?? undefined,
            thumbnailUrl: thumb ?? undefined,
          })
          .catch(() => {});
        return result.success;
      },
    });
  }

  if (container && btn.element.parentElement !== container) {
    container.appendChild(btn.element);
  } else if (targetVariant === "floating" && !btn.element.isConnected) {
    document.body.appendChild(btn.element);
  }
  refreshButtonLabel();
}

function getVideoIdFromHref(href: string): string | null {
  return PAGE_SITE?.videoIdFromUrl?.(href) ?? null;
}

// Thumbnail overlays are pointless on text links (and previously landed on
// comment timestamps, which also link to the video with an `lc` parameter).
// Only anchors that actually render a thumbnail get a button.
const MIN_THUMB_WIDTH = 96;
const MIN_THUMB_HEIGHT = 54;

function hasThumbnailImage(a: HTMLAnchorElement): boolean {
  for (const img of a.querySelectorAll<HTMLImageElement>("img")) {
    const rect = img.getBoundingClientRect();
    if (rect.width >= MIN_THUMB_WIDTH && rect.height >= MIN_THUMB_HEIGHT) {
      return true;
    }
  }
  return false;
}

const BADGE_INSET = 8;
const BADGE_HEIGHT = 28;

// YouTube (and other sites) render hover previews in a separate overlay that
// paints above the card itself, hiding anything positioned inside the card.
// Keeping all badges in one body-level layer above that overlay keeps them
// visible and clickable while a preview plays.
let badgeOverlay: HTMLDivElement | null = null;

function getBadgeOverlay(): HTMLDivElement {
  if (badgeOverlay?.isConnected) return badgeOverlay;

  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "0",
    height: "0",
    zIndex: "1",
    pointerEvents: "none",
  });
  document.body.appendChild(overlay);
  badgeOverlay = overlay;
  return overlay;
}

interface BadgePlacement {
  button: ActionButton;
  host: HTMLElement;
  reposition: () => void;
}

const badgePlacements = new Map<HTMLAnchorElement, BadgePlacement>();
const observedAnchors = new Set<HTMLAnchorElement>();
const pendingAnchorRoots = new Set<Element>();
let lastFullBadgeScan = 0;
const FULL_BADGE_SCAN_INTERVAL_MS = 3000;
let badgeRepositionQueued = false;

function repositionAllBadges(): void {
  for (const [anchor, placement] of badgePlacements) {
    if (!anchor.isConnected || !placement.host.isConnected) continue;
    placement.reposition();
  }
}

function scheduleBadgeReposition(): void {
  if (badgeRepositionQueued) return;
  badgeRepositionQueued = true;
  requestAnimationFrame(() => {
    badgeRepositionQueued = false;
    repositionAllBadges();
  });
}

// Card sizes change when the viewport resizes or when lazy content shifts the
// page, so keep the badges glued to their thumbnails.
const badgeResizeObserver = new ResizeObserver(scheduleBadgeReposition);
badgeResizeObserver.observe(document.documentElement);
window.addEventListener("resize", scheduleBadgeReposition);

// Attach badges only while their thumbnails are near the viewport. Long feeds
// (YouTube home, search, sidebars) otherwise accumulate thousands of shadow
// roots and listeners.
const badgeObserver = new IntersectionObserver(
  (entries) => {
    if (!showThumbButtons) return;
    for (const entry of entries) {
      const anchor = entry.target as HTMLAnchorElement;
      if (!anchor.isConnected) continue;
      if (entry.isIntersecting) {
        attachThumbnailButton(anchor);
      } else {
        detachThumbnailButton(anchor);
      }
    }
  },
  { rootMargin: "300px 0px" },
);

function attachThumbnailButton(a: HTMLAnchorElement): void {
  if (!showThumbButtons) return;
  if (badgePlacements.has(a)) return;
  if (!hasThumbnailImage(a)) return;

  const button = createActionButton({
    variant: "badge",
    label: "Play",
    ariaLabel: "Play with Media Launcher",
    onActivate: async ({ queue }) => {
      const url = resolveVideoUrl(a);
      if (!url) return false;
      const result = await relaySendUrl(url, queue);
      const videoId = getVideoIdFromHref(url);
      ext.runtime
        .sendMessage({
          type: "notify",
          success: result.success,
          error: result.error,
          queued: queue,
          queuedCount: result.queuedCount,
          videoId: videoId ?? undefined,
        })
        .catch(() => {});
      return result.success;
    },
  });

  const host = button.element;
  host.classList.add("ml-thumb-button");

  // Stop the click from reaching card-level handlers on the link's container.
  const stopNavigation = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  host.addEventListener("click", stopNavigation);
  host.addEventListener("auxclick", stopNavigation);

  const overlay = getBadgeOverlay();
  const reposition = (): void => {
    const anchorRect = a.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    host.style.left = `${
      Math.round(anchorRect.left - overlayRect.left) + BADGE_INSET
    }px`;
    host.style.top = `${
      Math.round(
        anchorRect.top -
          overlayRect.top +
          anchorRect.height -
          BADGE_INSET -
          BADGE_HEIGHT,
      )
    }px`;
  };

  overlay.appendChild(host);
  reposition();

  badgePlacements.set(a, { button, host, reposition });
  badgeResizeObserver.observe(a);
}

function detachThumbnailButton(anchor: HTMLAnchorElement): void {
  const placement = badgePlacements.get(anchor);
  if (!placement) return;
  placement.button.destroy();
  badgePlacements.delete(anchor);
  badgeResizeObserver.unobserve(anchor);
}

function pruneBadgePlacements(): void {
  for (const [anchor, placement] of badgePlacements) {
    if (anchor.isConnected && placement.host.isConnected) continue;
    placement.button.destroy();
    badgePlacements.delete(anchor);
    badgeResizeObserver.unobserve(anchor);
  }
  for (const anchor of observedAnchors) {
    if (anchor.isConnected) continue;
    badgeObserver.unobserve(anchor);
    observedAnchors.delete(anchor);
  }
}

function observeBadgeAnchor(a: HTMLAnchorElement): void {
  if (observedAnchors.has(a)) return;
  if (!a.isConnected) return;
  if (!PAGE_SITE?.isVideoLink(a)) return;
  // Text links and comment timestamps do not render a thumbnail.
  if (!a.querySelector("img")) return;
  observedAnchors.add(a);
  badgeObserver.observe(a);
}

function isNearBadgeViewport(a: HTMLAnchorElement): boolean {
  const rect = a.getBoundingClientRect();
  return rect.bottom > -300 && rect.top < window.innerHeight + 300;
}

function attachIfVisible(a: HTMLAnchorElement): void {
  if (badgePlacements.has(a)) return;
  if (!hasThumbnailImage(a)) return;
  if (!isNearBadgeViewport(a)) return;
  attachThumbnailButton(a);
}

function scanBadgeRoots(roots: Iterable<Element>): void {
  if (!PAGE_SITE) return;
  const selector = PAGE_SITE.linkSelector ?? "a[href]";
  for (const root of roots) {
    if (!root.isConnected) continue;

    if (root instanceof HTMLAnchorElement && root.matches(selector)) {
      observeBadgeAnchor(root);
      attachIfVisible(root);
    }

    for (const a of root.querySelectorAll<HTMLAnchorElement>(selector)) {
      observeBadgeAnchor(a);
      attachIfVisible(a);
    }

    // An image may be added inside an existing thumbnail anchor.
    const owner = root.closest("a[href]");
    if (owner instanceof HTMLAnchorElement) {
      observeBadgeAnchor(owner);
      attachIfVisible(owner);
    }
  }
}

function injectThumbnailBadges(): void {
  // Badges only ever appear on supported sites — skip the full-page anchor
  // scan otherwise.
  if (!PAGE_SITE) return;
  pruneBadgePlacements();
  lastFullBadgeScan = Date.now();
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    PAGE_SITE.linkSelector ?? "a[href]",
  );
  for (const a of anchors) {
    observeBadgeAnchor(a);
  }
}

/**
 * New anchors are discovered from mutation records; a periodic full scan is
 * only a safety net for SPA re-renders that do not produce child mutations.
 */
function refreshThumbnailBadges(): void {
  if (pendingAnchorRoots.size > 0) {
    const roots = [...pendingAnchorRoots];
    pendingAnchorRoots.clear();
    scanBadgeRoots(roots);
  }
  if (Date.now() - lastFullBadgeScan > FULL_BADGE_SCAN_INTERVAL_MS) {
    injectThumbnailBadges();
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
  badge.src = ext.runtime.getURL("play-logo.png");
  badge.alt = "Play playlist with Media Launcher";
  badge.title = "Play playlist with Media Launcher";
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
    const queue = e.shiftKey;
    badge.style.opacity = "0.5";
    badge.style.pointerEvents = "none";
    const result = await relaySendUrl(window.location.href, queue);
    badge.style.opacity = "0.9";
    badge.style.pointerEvents = "auto";
    ext.runtime
      .sendMessage({
        type: "notify",
        success: result.success,
        error: result.error,
        queued: queue,
        queuedCount: result.queuedCount,
      })
      .catch(() => {});
  });

  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  container.appendChild(badge);
}

// Busy pages (YouTube live chat, infinite scroll) mutate far faster than we
// can rescan, and our own badge/button injections re-trigger this observer —
// without throttling, the renderer starves and the page becomes unresponsive.
// Run at most once per interval, leading edge so the first mutation responds
// immediately and trailing so continuous mutation streams still get served.
const RUN_INTERVAL_MS = 200;
let runQueued = false;
let lastRun = 0;

function runInjectors(): void {
  if (!uiReady) return;

  if (showPageButton) {
    injectButton();
  } else {
    removeMainButton();
  }

  if (showThumbButtons) {
    refreshThumbnailBadges();
    injectPlaylistBadge();
  } else {
    clearThumbnailBadges();
    removePlaylistBadge();
  }

  refreshButtonLabel();
}

function scheduleRun(): void {
  if (runQueued) return;
  runQueued = true;
  const wait = Math.max(0, RUN_INTERVAL_MS - (Date.now() - lastRun));
  setTimeout(() => {
    runQueued = false;
    lastRun = Date.now();
    runInjectors();
  }, wait);
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "attributes") {
      if (record.target instanceof HTMLAnchorElement) {
        pendingAnchorRoots.add(record.target);
      }
      continue;
    }
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      pendingAnchorRoots.add(node);
      const owner = node.closest("a[href]");
      if (owner instanceof HTMLAnchorElement) {
        pendingAnchorRoots.add(owner);
      }
    }
  }
  scheduleRun();
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["href"],
});

// Images that finish loading inside a thumbnail can turn a previously text
// link into a badge target; load events do not bubble, so capture them.
window.addEventListener(
  "load",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    const owner = target.closest("a[href]");
    if (owner instanceof HTMLAnchorElement) {
      pendingAnchorRoots.add(owner);
      scheduleRun();
    }
  },
  true,
);

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (!changes.showPageButton && !changes.showThumbButtons) return;
  void loadUiSettings().then(runInjectors);
});

void loadUiSettings().then(runInjectors);
