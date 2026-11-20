const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// Share/tracking parameters that never change which video a URL points at.
// YouTube URLs are rebuilt explicitly below; for other sites this is the
// conservative set we drop.
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "si", "feature", "pp"]);

/**
 * Normalizes a URL for bookmark deduplication. YouTube share links, embed and
 * Shorts URLs, `www`/`m` hosts, and tracking parameters all collapse to one
 * form. Parameters that change playback (playlist context, timestamps on
 * non-YouTube sites) are preserved.
 *
 * This mirrors `server/src/url.ts` — keep the two in sync.
 */
export function canonicalizeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return value;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com")
  ) {
    const shortId =
      host === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : undefined;
    if (shortId && YOUTUBE_ID.test(shortId)) {
      return `https://www.youtube.com/watch?v=${shortId}`;
    }

    const pathMatch = url.pathname.match(
      /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
    );
    if (pathMatch) {
      return `https://www.youtube.com/watch?v=${pathMatch[1]}`;
    }

    const videoId = url.searchParams.get("v");
    if (videoId && YOUTUBE_ID.test(videoId)) {
      const params = new URLSearchParams({ v: videoId });
      // A watch URL that carries a playlist keeps that context: playing it
      // resolves the playlist, so it is a different bookmark than the video.
      const list = url.searchParams.get("list");
      if (list) {
        params.set("list", list);
        const index = url.searchParams.get("index");
        if (index) params.set("index", index);
      }
      return `https://www.youtube.com/watch?${params.toString()}`;
    }

    const list = url.searchParams.get("list");
    if (list && url.pathname === "/playlist") {
      return `https://www.youtube.com/playlist?${new URLSearchParams({
        list,
      }).toString()}`;
    }
  }

  const params = [...url.searchParams.entries()].filter(([key]) => {
    const lower = key.toLowerCase();
    return !lower.startsWith("utm_") && !TRACKING_PARAMS.has(lower);
  });
  const search =
    params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  // Keep the fragment for non-YouTube URLs: some sites route playback there.
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}${pathname}${search}${url.hash}`;
}

export function isPlaylistUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const isYouTube =
      u.hostname === "youtube.com" || u.hostname.endsWith(".youtube.com");
    if (isYouTube) {
      return Boolean(u.searchParams.get("list"));
    }
    // Vimeo albums, Twitch collections, etc. can be detected per-site.
    if (u.hostname === "vimeo.com" || u.hostname.endsWith(".vimeo.com")) {
      return /\/albums\//.test(u.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

export function parseTime(value: string): number | null {
  const t = value.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => isNaN(p)) || parts.length === 0) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (m && (m[1] || m[2] || m[3])) {
    return (
      (parseInt(m[1] ?? "0", 10) || 0) * 3600 +
      (parseInt(m[2] ?? "0", 10) || 0) * 60 +
      (parseInt(m[3] ?? "0", 10) || 0)
    );
  }
  return null;
}

export function getStartSeconds(url: string): number | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("t");
    if (q && parseTime(q) !== null) return parseTime(q);
    // youtu.be/ID#t=1m30s and similar fragment form
    const m = u.hash.match(/^#t=([^&]+)/);
    if (m && m[1] && parseTime(m[1]) !== null) return parseTime(m[1]);
    return null;
  } catch {
    return null;
  }
}
