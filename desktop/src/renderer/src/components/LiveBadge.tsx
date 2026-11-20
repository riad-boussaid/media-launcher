/** Live-like statuses have no meaningful resume position or completion. */
export function isLiveLike(status?: string): boolean {
  return status === "live" || status === "upcoming" || status === "post_live";
}

const LABELS: Record<string, string> = {
  live: "Live",
  upcoming: "Upcoming",
  post_live: "Live ended",
  was_live: "Was live",
};

export function LiveBadge({ status }: { status?: string }) {
  if (!status || status === "none" || !LABELS[status]) return null;
  const live = isLiveLike(status);
  const classes = live
    ? status === "upcoming"
      ? "bg-amber-500/15 text-amber-500"
      : "bg-red-500/15 text-red-500"
    : "bg-muted/60 text-muted";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em] ${classes}`}
    >
      {LABELS[status]}
    </span>
  );
}
