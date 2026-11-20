/**
 * Live-like videos cannot be resumed or marked watched: their position is a
 * moving target and "finished" depends on the stream, not a duration.
 * `was_live` is deliberately not included — a finished stream's VOD behaves
 * like any other video.
 */
export function isLiveLike(status: string | null | undefined): boolean {
  return status === "live" || status === "upcoming" || status === "post_live";
}

/**
 * Maps yt-dlp's live fields to the status stored with history and Watch Later
 * entries: "live", "upcoming", "post_live", "was_live", or "none".
 */
export function parseLiveStatus(
  liveStatus: unknown,
  isLive: unknown,
  wasLive: unknown,
): string {
  if (isLive === true || liveStatus === "is_live") return "live";
  if (liveStatus === "is_upcoming") return "upcoming";
  if (liveStatus === "post_live") return "post_live";
  if (liveStatus === "was_live" || wasLive === true) return "was_live";
  return "none";
}
