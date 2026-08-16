export interface Site {
  id: string;
  name: string;
  matches: (hostname: string) => boolean;
  isVideoLink: (anchor: HTMLAnchorElement) => boolean;
  resolveUrl: (anchor: HTMLAnchorElement) => string | null;
  buttonContainerSelector?: string;
  videoIdFromUrl?: (url: string) => string | null;
}

const host = (h: string) => (hostname: string) =>
  hostname === h || hostname.endsWith(`.${h}`);

const abs = (anchor: HTMLAnchorElement): string => {
  try {
    return new URL(anchor.href, location.href).href;
  } catch {
    return anchor.getAttribute("href") ?? "";
  }
};

export const SITES: Site[] = [
  {
    id: "youtube",
    name: "YouTube",
    matches: (hostname) => host("youtube.com")(hostname) || hostname === "youtu.be",
    isVideoLink: (a) => {
      const u = abs(a);
      return /(youtube\.com\/(watch|shorts|embed|v)\/|youtube\.com\/watch\?v=|youtu\.be\/)/.test(u);
    },
    resolveUrl: (a) => abs(a),
    buttonContainerSelector:
      "#actions-inner, #top-level-buttons-complemented, #secondary ytd-video-primary-info-renderer .ytd-video-primary-info-renderer",
    videoIdFromUrl: (u) => {
      const m = u.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      );
      return m?.[1] ?? null;
    },
  },
  {
    id: "vimeo",
    name: "Vimeo",
    matches: host("vimeo.com"),
    isVideoLink: (a) => /vimeo\.com\/(\d{6,})/.test(abs(a)),
    resolveUrl: (a) => abs(a),
    buttonContainerSelector: "button[data-testid='video-tools-button']",
  },
  {
    id: "dailymotion",
    name: "Dailymotion",
    matches: host("dailymotion.com"),
    isVideoLink: (a) => /dailymotion\.com\/video\//.test(abs(a)),
    resolveUrl: (a) => abs(a),
    buttonContainerSelector: ".PlayerHeader__titleActions__playerHeaderTitleActions",
  },
  {
    id: "twitch",
    name: "Twitch",
    matches: host("twitch.tv"),
    isVideoLink: (a) => /twitch\.tv\/\w+\/(videos|clips)\//.test(abs(a)),
    resolveUrl: (a) => abs(a),
    buttonContainerSelector: ".video-player__container",
  },
  {
    id: "bilibili",
    name: "Bilibili",
    matches: host("bilibili.com"),
    isVideoLink: (a) => /bilibili\.com\/video\//.test(abs(a)),
    resolveUrl: (a) => abs(a),
    buttonContainerSelector: "#video-title",
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    matches: host("soundcloud.com"),
    isVideoLink: (a) => {
      const u = abs(a);
      if (!/soundcloud\.com/.test(u)) return false;
      const p = new URL(u).pathname.split("/").filter(Boolean);
      return (
        p.length >= 2 &&
        !p.some((s) =>
          ["discover", "upload", "search", "explore", "settings"].includes(s),
        )
      );
    },
    resolveUrl: (a) => abs(a),
    buttonContainerSelector: ".playControls__inner",
  },
  {
    id: "facebook",
    name: "Facebook",
    matches: host("facebook.com"),
    isVideoLink: (a) => /facebook\.com\/(watch|reel|videos)/.test(abs(a)),
    resolveUrl: (a) => abs(a),
    buttonContainerSelector: "[data-testid='video-player']",
  },
  {
    id: "twitter",
    name: "X / Twitter",
    matches: (hostname) => hostname === "twitter.com" || hostname === "x.com" || host("twitter.com")(hostname) || host("x.com")(hostname),
    isVideoLink: (a) => /\/(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
  {
    id: "reddit",
    name: "Reddit",
    matches: host("reddit.com"),
    isVideoLink: (a) => /reddit\.com\/r\/[^/]+\/comments\//.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
  {
    id: "tiktok",
    name: "TikTok",
    matches: host("tiktok.com"),
    isVideoLink: (a) => /tiktok\.com\/@[\w.]+\/(video|live)/.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
  {
    id: "instagram",
    name: "Instagram",
    matches: host("instagram.com"),
    isVideoLink: (a) => /instagram\.com\/(reel|p|tv)\//.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
  {
    id: "kick",
    name: "Kick",
    matches: host("kick.com"),
    isVideoLink: (a) => /kick\.com\/(video|clip)\//.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
  {
    id: "rumble",
    name: "Rumble",
    matches: host("rumble.com"),
    isVideoLink: (a) => /rumble\.com\/v/.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
  {
    id: "odysee",
    name: "Odysee",
    matches: host("odysee.com"),
    isVideoLink: (a) => /odysee\.com\/@[\w.-]+\/[\w.-]+/.test(abs(a)),
    resolveUrl: (a) => abs(a),
  },
];

export function siteForHost(hostname: string): Site | null {
  return SITES.find((s) => s.matches(hostname)) ?? null;
}

export function isVideoLink(anchor: HTMLAnchorElement): boolean {
  const site = siteForHost(location.hostname);
  if (site) return site.isVideoLink(anchor);
  return false;
}

export function resolveVideoUrl(anchor: HTMLAnchorElement): string | null {
  const site = siteForHost(location.hostname);
  if (site && site.isVideoLink(anchor)) return site.resolveUrl(anchor);
  return null;
}

export function getPageThumbnail(doc: Document): string | null {
  const meta =
    doc.querySelector<HTMLMetaElement>(
      'meta[property="og:image"], meta[name="twitter:image"], meta[property="og:image:secure_url"]',
    );
  if (meta?.content) return meta.content;
  const link = doc.querySelector<HTMLLinkElement>('link[rel="image_src"]');
  return link?.href ?? null;
}