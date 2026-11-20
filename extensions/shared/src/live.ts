/** Live-like statuses have no meaningful resume position or completion. */
export function isLiveLike(status?: string): boolean {
  return status === "live" || status === "upcoming" || status === "post_live";
}

/** Human label for a stored live status, or null when there is nothing to show. */
export function liveLabel(status?: string): string | null {
  if (status === "live") return "Live";
  if (status === "upcoming") return "Upcoming";
  if (status === "post_live") return "Live ended";
  if (status === "was_live") return "Was live";
  return null;
}
