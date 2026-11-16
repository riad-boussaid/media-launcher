import { getServerHealthInfo, sendUrl } from "@shared/api";
import { EXPECTED_SERVER_API_VERSION } from "@shared/discovery";
import { ext } from "@shared/ext";
import {
  clearAll,
  getRecent,
  type HistoryEntry,
  migrateLegacy,
  removeEntry,
} from "@shared/history";
import { defaultSettings, getSettings } from "@shared/settings";
import { isPlaylistUrl } from "@shared/url";
import {
  CheckCircle2,
  ChevronDown,
  History,
  Info,
  ListPlus,
  Loader2,
  MonitorPlay,
  PanelRightOpen,
  Play,
  Settings,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

function getYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).match(/^[a-zA-Z0-9_-]{11}/)?.[0] ?? null;
    }
    if (u.hostname === "youtube.com" || u.hostname.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      return m?.[2] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function timeAgo(timestamp: number): string {
  const s = Math.floor((Date.now() - timestamp) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** 16:9 YouTube thumbnail, falling back to hqdefault when maxres is missing. */
function HeroThumb({
  videoId,
  alt,
  className,
}: {
  videoId: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
      alt={alt}
      className={className}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallback !== "1") {
          img.dataset.fallback = "1";
          img.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }}
    />
  );
}

const QUALITY_ITEMS = [
  { value: "2160", label: "4K" },
  { value: "1440", label: "1440p" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "a", label: "Audio only" },
];

const CODEC_ITEMS = [
  { value: "any", label: "Any" },
  { value: "h264", label: "H.264" },
  { value: "vp9", label: "VP9" },
  { value: "av1", label: "AV1" },
  { value: "h265", label: "H.265" },
];

type ServerStatus = "checking" | "connected" | "disconnected";

export default function Popup({
  mode = "popup",
}: {
  mode?: "popup" | "sidebar";
}) {
  const [tabUrl, setTabUrl] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  // status extends SendResult with a custom success message (e.g. "Added to queue").
  const [status, setStatus] = useState<{
    success: boolean;
    error?: string;
    message?: string;
  } | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [serverInfo, setServerInfo] = useState<{
    version?: string;
    apiVersion?: number;
  } | null>(null);
  const [maxHeight, setMaxHeight] = useState(defaultSettings.maxHeight);
  const [codec, setCodec] = useState(defaultSettings.codec);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(
    () => localStorage.getItem("ml-history-open") !== "0",
  );

  const toggleHistory = () => {
    setHistoryOpen((open) => {
      localStorage.setItem("ml-history-open", open ? "0" : "1");
      return !open;
    });
  };

  // Popup only: expand the list past its 3-row cap to show every entry; the
  // popup document scrolls (its scrollbar is hidden).
  const [showAllHistory, setShowAllHistory] = useState(
    () => localStorage.getItem("ml-history-show-all") === "1",
  );

  const toggleShowAll = () => {
    setShowAllHistory((v) => {
      localStorage.setItem("ml-history-show-all", v ? "0" : "1");
      return !v;
    });
  };

  const youtubeId = getYoutubeId(tabUrl);
  const thumbUrl = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`
    : null;
  const isPlaylist = isPlaylistUrl(tabUrl);
  // Only http(s) tabs can be handed to the player.
  const isWebUrl = /^https?:/i.test(tabUrl);
  // Firefox has no sidePanel API — hide the "open in sidebar" shortcut there.
  const canOpenSidePanel = typeof ext.sidePanel?.open === "function";
  // Firefox uses sidebar_action instead.
  const firefoxSidebar = (
    ext as unknown as { sidebarAction?: { open?: () => Promise<void> } }
  ).sidebarAction;
  const canOpenFirefoxSidebar = typeof firefoxSidebar?.open === "function";

  useEffect(() => {
    try {
      Promise.resolve(ext.runtime.sendMessage("check-server")).catch(() => {});
    } catch {
      /* ignore */
    }

    getSettings().then((opts) => {
      if (opts.maxHeight) setMaxHeight(opts.maxHeight);
      if (opts.codec) setCodec(opts.codec);
    });

    void migrateLegacy().then(getRecent).then(setHistory);

    ext.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) setTabUrl(tab.url);
      if (tab?.title) setTabTitle(tab.title);
    });

    getServerHealthInfo()
      .then((info) => {
        setServerStatus(info.ok ? "connected" : "disconnected");
        setServerInfo(
          info.ok
            ? { version: info.version, apiVersion: info.apiVersion }
            : null,
        );
      })
      .catch(() => {
        setServerStatus("disconnected");
        setServerInfo(null);
      });
  }, []);

  // yt-dlp metadata enrichment can take a while — keep polling while a visible
  // entry still lacks both title and thumbnail (mirrors the desktop History
  // page's poll).
  useEffect(() => {
    if (!history.some((e) => !e.title && !e.thumbnail)) return;
    const t = setInterval(() => void getRecent().then(setHistory), 3000);
    return () => clearInterval(t);
  }, [history]);

  const handlePlay = async (url: string, title: string) => {
    if (!url.trim() || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const result = await sendUrl(url, title);
      setStatus(result);
      if (result.success) {
        // The server recorded the play (move-to-top) — refresh the list.
        void getRecent().then(setHistory);
        setTimeout(() => setStatus(null), 2000);
      }
    } finally {
      setSending(false);
    }
  };

  const handlePlayCurrent = () => handlePlay(tabUrl, tabTitle);

  const handleQueueCurrent = async () => {
    if (!tabUrl.trim() || queueing) return;
    setQueueing(true);
    setStatus(null);
    try {
      const result = await sendUrl(tabUrl, tabTitle, true);
      setStatus(
        result.success ? { success: true, message: "Added to queue" } : result,
      );
      if (result.success) {
        void getRecent().then(setHistory);
        setTimeout(() => setStatus(null), 2000);
      }
    } finally {
      setQueueing(false);
    }
  };

  const handleRemove = async (id: string) => {
    setHistory(await removeEntry(id));
  };

  const dot =
    serverStatus === "connected" ? (
      <span
        className="size-2 shrink-0 rounded-full bg-green-500 ring-2 ring-green-500/20"
        title={
          serverInfo?.version
            ? `Server connected · v${serverInfo.version}`
            : "Server connected"
        }
      />
    ) : serverStatus === "disconnected" ? (
      <span
        className="size-2 shrink-0 rounded-full bg-red-500 ring-2 ring-red-500/20"
        title="Server not found"
      />
    ) : (
      <Loader2 className="size-3 animate-spin text-muted-foreground" />
    );

  const serverVersionLabel =
    serverStatus === "connected" && serverInfo?.version ? (
      <span
        className="text-[10px] text-muted-foreground"
        title={
          typeof serverInfo.apiVersion === "number"
            ? `Server API ${serverInfo.apiVersion}`
            : "Server API version unknown"
        }
      >
        v{serverInfo.version}
      </span>
    ) : null;

  const isSidebar = mode === "sidebar";

  // The popup view scrolls at the document level (Chrome caps popups at 600px);
  // hide the native document scrollbar there — wheel scrolling and the clipped
  // last row keep the affordance.
  useEffect(() => {
    if (isSidebar) return;
    document.documentElement.classList.add("popup-doc");
    return () => document.documentElement.classList.remove("popup-doc");
  }, [isSidebar]);

  // Keep the toolbar icon in sync with the panel: while the sidebar is open,
  // the icon focuses the panel instead of opening the popup. The panel document
  // stays loaded across open/close cycles in Chrome, so track visibility (not
  // mount) and set the icon target directly from this page — no message to the
  // service worker that could be lost. Chrome only; Firefox has no sidePanel.
  useEffect(() => {
    if (!isSidebar || typeof chrome.sidePanel === "undefined") return;

    const syncIcon = async () => {
      const visible = document.visibilityState === "visible";
      const win = await chrome.windows.getCurrent();
      if (win.id === undefined) return;
      const key = `sidebar-open:${win.id}`;
      if (visible) {
        await chrome.storage.session.set({ [key]: true });
        await chrome.action.setPopup({ popup: "" });
      } else {
        await chrome.storage.session.remove(key);
        await chrome.action.setPopup({ popup: "popup.html" });
      }
    };

    void syncIcon();
    document.addEventListener("visibilitychange", syncIcon);
    // If Chrome unloads the panel on close instead of hiding it, pagehide is
    // the last chance to restore the popup target.
    const onPageHide = () => {
      void chrome.windows.getCurrent().then((win) => {
        if (win.id !== undefined) {
          void chrome.storage.session.remove(`sidebar-open:${win.id}`);
        }
        void chrome.action.setPopup({ popup: "popup.html" });
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", syncIcon);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isSidebar]);

  return (
    <div
      className={
        isSidebar
          ? "min-h-dvh bg-background text-card-foreground"
          : "w-80 bg-card text-card-foreground"
      }
    >
      {isSidebar && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur">
          <img
            src={ext.runtime.getURL("play-logo.png")}
            alt=""
            className="size-6 shrink-0"
          />
          <span className="text-sm font-semibold tracking-tight">
            media-launcher
          </span>
          {dot}
          {serverVersionLabel}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => ext.runtime.openOptionsPage()}
              title="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        className={
          isSidebar
            ? "mx-auto flex w-full min-h-dvh max-w-md flex-col space-y-4 p-4"
            : "space-y-3 p-3"
        }
      >
        {!isSidebar && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight">
                media-launcher
              </span>
              {dot}
              {serverVersionLabel}
            </div>
            <div className="flex items-center gap-1">
              {(canOpenSidePanel || canOpenFirefoxSidebar) && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    if (canOpenSidePanel) {
                      const [tab] = await chrome.tabs.query({
                        active: true,
                        currentWindow: true,
                      });
                      if (tab?.windowId) {
                        await chrome.sidePanel.open({ windowId: tab.windowId });
                      }
                    } else {
                      await firefoxSidebar?.open?.();
                      window.close();
                    }
                  }}
                  title="Open in sidebar"
                >
                  <PanelRightOpen className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => ext.runtime.openOptionsPage()}
                title="Settings"
              >
                <Settings className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {serverStatus === "connected" &&
          serverInfo &&
          serverInfo.apiVersion !== EXPECTED_SERVER_API_VERSION && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] leading-snug text-destructive">
              Unsupported server API version. Update the extension and the
              desktop app.
            </div>
          )}

        {isWebUrl ? (
          <>
            {/* Hero: the focused video. Clicking the artwork plays it. */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <button
                type="button"
                onClick={handlePlayCurrent}
                disabled={sending}
                className="group/hero relative block w-full cursor-pointer"
                title="Play this video"
              >
                {thumbUrl ? (
                  <HeroThumb
                    videoId={youtubeId ?? ""}
                    alt={tabTitle || "Video thumbnail"}
                    className="aspect-video w-full bg-muted object-cover"
                  />
                ) : (
                  <span className="flex aspect-video w-full items-center justify-center bg-muted">
                    <MonitorPlay className="size-8 text-muted-foreground" />
                  </span>
                )}
                {isPlaylist && (
                  <span className="absolute top-2 left-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-foreground uppercase backdrop-blur">
                    Playlist
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/45 text-sm font-medium text-white opacity-0 transition-opacity group-hover/hero:opacity-100">
                  <Play className="size-4 fill-current" />
                  Play
                </span>
              </button>
              <div className={isSidebar ? "space-y-1 p-3" : "space-y-1 p-2.5"}>
                <p
                  className={`truncate font-medium leading-tight ${
                    isSidebar ? "text-sm" : "text-xs"
                  }`}
                >
                  {tabTitle}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {hostnameOf(tabUrl)}
                </p>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Select
                    value={maxHeight}
                    onValueChange={(v) => {
                      if (v) setMaxHeight(v);
                      ext.storage.sync.set({ maxHeight: v });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label="Resolution"
                      className="h-7! rounded-full bg-muted/60 px-2.5! text-[11px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALITY_ITEMS.map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={codec}
                    onValueChange={(v) => {
                      if (v) setCodec(v);
                      ext.storage.sync.set({ codec: v });
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label="Codec"
                      className="h-7! rounded-full bg-muted/60 px-2.5! text-[11px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CODEC_ITEMS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span
                    className="ml-auto shrink-0 text-muted-foreground"
                    title="Falls back to the best available option if the video doesn't offer the selected quality or codec."
                  >
                    <Info className="size-3.5" />
                  </span>
                </div>
              </div>
            </div>

            <Button
              className="h-9 w-full gap-1.5"
              onClick={handlePlayCurrent}
              disabled={sending}
            >
              {sending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Sending...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Play className="size-4 fill-current" />
                  {isPlaylist ? "Play playlist" : "Play"}
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={handleQueueCurrent}
              disabled={queueing || sending}
            >
              {queueing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Adding…
                </>
              ) : (
                <>
                  <ListPlus className="size-3.5" /> Add to queue
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center">
              <MonitorPlay className="size-5 text-muted-foreground" />
              <p className="text-xs font-medium">No video on this tab</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Open a video site (YouTube, etc.), then hit Play.
              </p>
            </div>
            <Button className="h-9 w-full gap-1.5" disabled>
              <Play className="size-4 fill-current" />
              Play
            </Button>
          </>
        )}

        {status && !status.success && (
          <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{status.error}</span>
          </div>
        )}
        {status?.success && (
          <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-2 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-3.5" />
            <span>{status.message ?? "Sent to player"}</span>
          </div>
        )}

        {history.length > 0 && (
          <>
            <Separator />
            <div className={isSidebar ? "flex min-h-0 flex-1 flex-col" : ""}>
              <div className="mb-1 flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-expanded={historyOpen}
                  className="flex flex-1 items-center gap-1 rounded p-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-accent hover:text-foreground"
                  onClick={toggleHistory}
                >
                  <History className="size-3" />
                  <span>Recent</span>
                  <span className="text-[10px] tracking-normal normal-case opacity-70">
                    {history.length}
                  </span>
                  <ChevronDown
                    className={`ml-auto size-3 transition-transform ${
                      historyOpen ? "" : "-rotate-90"
                    }`}
                  />
                </button>
                {historyOpen && (
                  <button
                    type="button"
                    className="flex items-center gap-0.5 rounded p-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Clear history"
                    onClick={async () => {
                      if (await clearAll()) {
                        setHistory([]);
                      } else {
                        setStatus({
                          success: false,
                          error: "Server unreachable — history not cleared",
                        });
                      }
                    }}
                  >
                    <Trash2 className="size-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              {historyOpen && (
                <div
                  className={
                    isSidebar
                      ? "no-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto"
                      : `no-scrollbar space-y-0.5 ${
                          showAllHistory ? "" : "max-h-30 overflow-y-auto"
                        }`
                  }
                >
                  {history
                    .slice(0, isSidebar || showAllHistory ? 20 : 10)
                    .map((entry) => {
                      const id = getYoutubeId(entry.url);
                      const thumbSrc =
                        entry.thumbnail ||
                        (id
                          ? `https://img.youtube.com/vi/${id}/mqdefault.jpg`
                          : null);
                      return (
                        <div
                          key={entry.id}
                          className="group flex items-center gap-0.5 rounded-lg pr-0.5 hover:bg-accent"
                        >
                          <button
                            type="button"
                            onClick={() => handlePlay(entry.url, entry.title)}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left ${
                              isSidebar ? "py-1" : "py-0.5"
                            }`}
                            title={entry.title || entry.url}
                          >
                            {thumbSrc ? (
                              <img
                                src={thumbSrc}
                                alt=""
                                className={`${
                                  isSidebar ? "h-9 w-16" : "h-6 w-11"
                                } shrink-0 rounded-md border object-cover`}
                              />
                            ) : (
                              <span
                                className={`${
                                  isSidebar ? "flex h-9 w-16" : "flex h-6 w-11"
                                } shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground`}
                              >
                                <History className="size-3.5" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-xs">
                              {entry.title || entry.url}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {timeAgo(entry.timestamp)}
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                            title="Remove"
                            onClick={() => void handleRemove(entry.id)}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      );
                    })}
                </div>
              )}
              {historyOpen && !isSidebar && history.length > 10 && (
                <button
                  type="button"
                  className="mt-0.5 flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={toggleShowAll}
                >
                  <ChevronDown
                    className={`size-3 transition-transform ${
                      showAllHistory ? "rotate-180" : ""
                    }`}
                  />
                  {showAllHistory ? "Show less" : `Show all ${history.length}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {!isSidebar && (
        <div className="border-t px-3 py-2 text-center text-[10px] leading-relaxed text-muted-foreground">
          <p className="m-0">Shift-click in-page buttons to queue.</p>
          <p className="m-0">Shortcuts: Alt+Shift+P play · Alt+Shift+Q queue</p>
        </div>
      )}
    </div>
  );
}
