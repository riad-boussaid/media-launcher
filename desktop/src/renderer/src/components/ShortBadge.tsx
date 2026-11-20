function shortFormLabel(url?: string): string {
  return url && /\/reels?\//i.test(url) ? "Reel" : "Short";
}

export function ShortBadge({
  isShort,
  url,
}: {
  isShort?: boolean;
  url?: string;
}) {
  if (!isShort) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.05em] text-fuchsia-400">
      {shortFormLabel(url)}
    </span>
  );
}
