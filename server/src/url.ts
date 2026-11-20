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
 * This mirrors `extensions/shared/src/url.ts` — keep the two in sync.
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
