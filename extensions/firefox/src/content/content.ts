import { sendUrl } from "@/lib/api";

function injectButton(): void {
  const existing = document.getElementById("ml-btn");
  if (existing) return;

  const actions = document.querySelector(
    "#actions-inner, #top-level-buttons-complemented, #secondary ytd-video-primary-info-renderer .ytd-video-primary-info-renderer",
  );
  if (!actions) return;

  const btn = document.createElement("button");
  btn.id = "ml-btn";
  btn.textContent = "Play with Media Launcher";
  Object.assign(btn.style, {
    marginLeft: "8px",
    padding: "0 16px",
    height: "36px",
    border: "1px solid #555",
    borderRadius: "18px",
    background: "transparent",
    color: "#eee",
    fontSize: "14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });
  btn.addEventListener("click", async () => {
    btn.textContent = "Sending...";
    btn.style.opacity = "0.6";
    btn.style.pointerEvents = "none";
    const result = await sendUrl(window.location.href);
    btn.textContent = result.success ? "Sent ✓" : `Error ✗`;
    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
    setTimeout(() => {
      btn.textContent = "Play with Media Launcher";
    }, 3000);
  });
  actions.appendChild(btn);
}

function getVideoId(element: HTMLElement): string | null {
  const anchor = element.closest("a");
  if (!anchor) return null;
  const href = anchor.getAttribute("href");
  if (!href) return null;
  const m = href.match(/[?&]v=([a-zA-Z0-9_-]{11})|^\/shorts\/([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? m?.[2] ?? null;
}

function injectBadge(a: HTMLAnchorElement): void {
  if (a.querySelector(".ml-badge")) return;

  const badge = document.createElement("img");
  badge.className = "ml-badge";
  badge.src = chrome.runtime.getURL("mpv-logo.png");
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
    const id = getVideoId(a);
    if (!id) return;
    badge.style.opacity = "0.5";
    const result = await sendUrl(`https://www.youtube.com/watch?v=${id}`);
    badge.style.opacity = "1";
  });

  const target = a as HTMLElement;
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }
  target.appendChild(badge);
}

function injectThumbnailBadges(): void {
  const done = new Set<string>();
  const selector = 'a[href*="/watch?v="], a[href^="/shorts/"]';
  document.querySelectorAll<HTMLAnchorElement>(selector).forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    if (done.has(href)) return;
    done.add(href);
    injectBadge(a);
  });
}

const observer = new MutationObserver(() => {
  injectButton();
  injectThumbnailBadges();
});
observer.observe(document.body, { childList: true, subtree: true });

injectButton();
injectThumbnailBadges();

