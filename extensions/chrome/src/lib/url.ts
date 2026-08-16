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