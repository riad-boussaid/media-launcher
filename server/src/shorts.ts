function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isShortPlatformHost(host: string): boolean {
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "instagram.com" ||
    host.endsWith(".instagram.com")
  );
}

/** True for a Facebook or Instagram Reel URL. */
export function isReelUrl(value: string): boolean {
  const host = hostOf(value);
  if (!host || !isShortPlatformHost(host)) return false;
  if (host.endsWith(".youtube.com") || host === "youtube.com") return false;
  try {
    return /^\/reels?\//i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

/** True for a YouTube Shorts, Facebook Reel, or Instagram Reel URL. */
export function isShortUrl(value: string): boolean {
  const host = hostOf(value);
  if (!host) return false;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    try {
      return /^\/shorts\//.test(new URL(value).pathname);
    } catch {
      return false;
    }
  }
  return isReelUrl(value);
}

/**
 * Detects a short-form video from yt-dlp metadata when the original URL does
 * not tell us (for example a /watch?v= link to a Short): a vertical video up to
 * three minutes on a Shorts/Reels platform, or a metadata URL whose path says
 * /shorts/ or /reel(s)/.
 */
export function isShortMetadata(obj: Record<string, unknown>): boolean {
  const webpageUrl = typeof obj.webpage_url === "string" ? obj.webpage_url : "";
  const originalUrl =
    typeof obj.original_url === "string" ? obj.original_url : "";
  if (isShortUrl(webpageUrl) || isShortUrl(originalUrl)) return true;

  const candidate = webpageUrl || originalUrl;
  const host = hostOf(candidate);
  if (!host || !isShortPlatformHost(host)) return false;

  const duration = typeof obj.duration === "number" ? obj.duration : 0;
  const width = typeof obj.width === "number" ? obj.width : 0;
  const height = typeof obj.height === "number" ? obj.height : 0;
  return (
    duration > 0 && duration <= 180 && width > 0 && height > 0 && height > width
  );
}
