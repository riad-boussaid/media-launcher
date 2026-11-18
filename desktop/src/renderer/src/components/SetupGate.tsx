import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DownloadItem,
  getDownloads,
  getPlatform,
  getSettings,
  openExternal,
  recheckDownloads,
  type Settings,
  startDownload,
} from "../lib/api";

interface SetupGateProps {
  onReadyChange: (ready: boolean) => void;
}

function isReady(item: DownloadItem | undefined): boolean {
  return Boolean(item && (item.installed || item.systemAvailable));
}

function ToolRow({ item }: { item: DownloadItem }) {
  let label = "Missing";
  let tone = "text-warning";
  if (item.installed) {
    label = "Installed";
    tone = "text-success";
  } else if (item.systemAvailable) {
    label = "On system";
    tone = "text-success";
  } else if (item.status === "downloading") {
    label =
      item.progress !== null && item.progress >= 0
        ? `${Math.round(item.progress * 100)}%`
        : "Downloading…";
    tone = "text-accent";
  }
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span
        className={`h-1.5 w-1.5 flex-none rounded-full ${
          isReady(item) ? "bg-success" : "bg-warning"
        }`}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-[12px] text-text-dim">
        {item.name}
        {item.id === "yt-dlp" && (
          <span className="text-muted">
            {" "}
            — resolves YouTube and other links
          </span>
        )}
        {item.id === "ffmpeg" && (
          <span className="text-muted"> — recommended for merging formats</span>
        )}
      </span>
      {item.status === "downloading" &&
        item.progress !== null &&
        item.progress >= 0 && (
          <span className="h-1 w-16 flex-none overflow-hidden rounded-full bg-elevated">
            <span
              className="block h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </span>
        )}
      <span className={`flex-none text-[11px] ${tone}`}>{label}</span>
    </li>
  );
}

export default function SetupGate({ onReadyChange }: SetupGateProps) {
  const platform = getPlatform();
  const [downloads, setDownloads] = useState<DownloadItem[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async (recheck = false) => {
    try {
      setDownloads(recheck ? await recheckDownloads() : await getDownloads());
    } catch {
      /* leave the last known status */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void getSettings()
      .then(setSettings)
      .catch(() => {});
  }, [refresh]);

  const byId = useMemo(
    () => new Map((downloads ?? []).map((item) => [item.id, item])),
    [downloads],
  );
  const player = settings?.player || "mpv";
  const mpv = byId.get("mpv");
  const ytDlp = byId.get("yt-dlp");
  const ffmpeg = byId.get("ffmpeg");

  const needsMpv = player === "mpv" && downloads !== null && !isReady(mpv);
  const needsYtDlp = downloads !== null && !isReady(ytDlp);
  const blocking = needsMpv || needsYtDlp;

  useEffect(() => {
    if (!downloads || !settings) return;
    onReadyChange(!blocking);
  }, [downloads, settings, blocking, onReadyChange]);

  const hasDownloading =
    downloads?.some((item) => item.status === "downloading") ?? false;
  useEffect(() => {
    if (!installing && !hasDownloading) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [installing, hasDownloading, refresh]);

  const tools = useMemo(() => {
    const list: DownloadItem[] = [];
    if (player === "mpv" && mpv) list.push(mpv);
    if (ytDlp) list.push(ytDlp);
    if (ffmpeg) list.push(ffmpeg);
    return list;
  }, [player, mpv, ytDlp, ffmpeg]);

  const installIds = useMemo(
    () =>
      tools
        .filter((item) => item.canDownload && !isReady(item))
        .map((item) => item.id),
    [tools],
  );

  const command =
    platform === "darwin"
      ? "brew install mpv ffmpeg"
      : "sudo apt install mpv ffmpeg";

  const installAll = async () => {
    if (installing || installIds.length === 0) return;
    setInstalling(true);
    setError(null);
    try {
      for (const id of installIds) {
        const items = await startDownload(id);
        setDownloads(items);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
      await refresh();
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the command");
    }
  };

  if (!downloads || !settings || !blocking) return null;

  return (
    <section
      className="mb-5 rounded-xl border border-warning/30 bg-warning/5 p-4"
      aria-labelledby="setup-title"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-warning/10 text-warning">
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="m-0 text-sm font-semibold text-text">
            Set up playback
          </h2>
          <p className="mt-1 mb-0 text-[12px] leading-snug text-muted">
            media-launcher needs mpv to play videos and yt-dlp to resolve links
            from YouTube and other sites.
          </p>
        </div>
      </div>

      <ul className="m-0 mt-3 list-none border-t border-warning/15 p-0">
        {tools.map((item) => (
          <ToolRow key={item.id} item={item} />
        ))}
      </ul>

      {platform !== "win32" && needsMpv && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
            {platform === "darwin"
              ? "Install with Homebrew"
              : "Install with your package manager"}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11.5px] text-text-dim">
              {command}
            </code>
            <button
              type="button"
              className="shrink-0 rounded border border-border px-2 py-1 text-[10.5px] text-muted transition-colors hover:border-border-strong hover:text-text"
              onClick={() => void copyCommand()}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {platform === "linux" && (
            <p className="mt-1 mb-0 text-[10.5px] leading-snug text-muted">
              Debian/Ubuntu example — use your distribution's package manager.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 mb-0 text-[11px] leading-snug text-danger">
          Setup failed: {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {installIds.length > 0 && (
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={installing}
            onClick={() => void installAll()}
          >
            {installing
              ? "Installing…"
              : needsMpv
                ? "Install playback engine"
                : "Install yt-dlp"}
          </button>
        )}
        {platform !== "win32" && needsMpv && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => void openExternal("https://mpv.io/installation/")}
          >
            Installation guide
          </button>
        )}
        <button
          type="button"
          className="p-0 text-[11.5px] text-muted transition-colors hover:text-text"
          onClick={() => void refresh(true)}
        >
          Recheck
        </button>
      </div>

      {installIds.length > 0 && (
        <p className="mt-2 mb-0 text-[10.5px] leading-snug text-muted">
          Portable copies are saved in the app's data folder — no admin rights
          needed.
        </p>
      )}
    </section>
  );
}
