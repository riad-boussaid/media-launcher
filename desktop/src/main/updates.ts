import { app, net } from "electron";

const RELEASES_API =
  "https://api.github.com/repos/riad-boussaid/media-launcher/releases/latest";
const CHECK_TTL_MS = 6 * 60 * 60 * 1000;

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  notes: string;
  publishedAt: string | null;
  checkedAt: number;
  error: string | null;
}

interface GitHubAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GitHubRelease {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  body?: unknown;
  published_at?: unknown;
  assets?: unknown;
}

let cached: AppUpdateInfo | null = null;
let cachedAt = 0;
let inflight: Promise<AppUpdateInfo> | null = null;

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function numericParts(value: string): number[] {
  return normalizeVersion(value)
    .split("-")[0]
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part.replace(/[^\d].*$/, ""), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

/** Minimal semver comparison; stable releases sort after pre-releases. */
export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = numericParts(latest);
  const currentParts = numericParts(current);
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const a = latestParts[i] ?? 0;
    const b = currentParts[i] ?? 0;
    if (a !== b) return a > b;
  }
  const latestPre = normalizeVersion(latest).split("-")[1] ?? "";
  const currentPre = normalizeVersion(current).split("-")[1] ?? "";
  if (latestPre === currentPre) return false;
  if (!latestPre) return true;
  if (!currentPre) return false;
  return latestPre > currentPre;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function pickAsset(release: GitHubRelease): string | null {
  if (!Array.isArray(release.assets)) return null;
  const assets = (release.assets as GitHubAsset[])
    .map((asset) => ({
      name: stringField(asset.name),
      url: stringField(asset.browser_download_url),
    }))
    .filter(
      (asset): asset is { name: string; url: string } =>
        asset.name !== null && asset.url !== null,
    );
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const match = (pattern: RegExp) =>
    assets.find((asset) => pattern.test(asset.name));
  if (process.platform === "win32") {
    return match(/\.exe$/i)?.url ?? null;
  }
  if (process.platform === "darwin") {
    return (
      match(new RegExp(`${arch}.*\\.(dmg|zip)$`, "i"))?.url ??
      match(/\.dmg$/i)?.url ??
      match(/\.zip$/i)?.url ??
      null
    );
  }
  return (
    match(new RegExp(`${arch}.*\\.(AppImage|deb)$`, "i"))?.url ??
    match(/\.AppImage$/i)?.url ??
    match(/\.deb$/i)?.url ??
    null
  );
}

async function fetchLatest(): Promise<AppUpdateInfo> {
  const currentVersion = app.getVersion();
  const response = await net.fetch(RELEASES_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "media-launcher",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "GitHub rate limit reached"
        : `GitHub returned HTTP ${response.status}`,
    );
  }
  const release = (await response.json()) as GitHubRelease;
  const tag = stringField(release.tag_name);
  const latestVersion = tag ? normalizeVersion(tag) : null;
  const releaseUrl = stringField(release.html_url);
  const downloadUrl = pickAsset(release) ?? releaseUrl;
  const notes = stringField(release.body) ?? "";
  return {
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(
      latestVersion && isNewerVersion(latestVersion, currentVersion),
    ),
    releaseName: stringField(release.name) ?? latestVersion,
    releaseUrl,
    downloadUrl,
    notes: notes.slice(0, 5000),
    publishedAt: stringField(release.published_at),
    checkedAt: Date.now(),
    error: null,
  };
}

export function getAppUpdateState(): AppUpdateInfo | null {
  return cached;
}

/**
 * Checks GitHub Releases. Results are cached for six hours; pass force from an
 * explicit "Check for updates" action. Network failures keep the previous
 * result and attach an error instead of throwing.
 */
export async function checkAppUpdate(force = false): Promise<AppUpdateInfo> {
  if (!force && cached && Date.now() - cachedAt < CHECK_TTL_MS) {
    return cached;
  }
  if (inflight) return inflight;
  inflight = fetchLatest()
    .then((info) => {
      cached = info;
      cachedAt = Date.now();
      return info;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const failed: AppUpdateInfo = {
        currentVersion: app.getVersion(),
        latestVersion: cached?.latestVersion ?? null,
        updateAvailable: cached?.updateAvailable ?? false,
        releaseName: cached?.releaseName ?? null,
        releaseUrl: cached?.releaseUrl ?? null,
        downloadUrl: cached?.downloadUrl ?? null,
        notes: cached?.notes ?? "",
        publishedAt: cached?.publishedAt ?? null,
        checkedAt: Date.now(),
        error: message,
      };
      cached = failed;
      cachedAt = Date.now();
      return failed;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
