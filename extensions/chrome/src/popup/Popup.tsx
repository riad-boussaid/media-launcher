import { checkServerHealth, type SendResult, sendUrl } from "@shared/api";
import {
  addHistory,
  clearHistory,
  getHistory,
  type HistoryEntry,
} from "@shared/history";
import { defaultSettings } from "@shared/settings";
import { isPlaylistUrl } from "@shared/url";
import {
  CheckCircle2,
  History,
  Loader2,
  PanelRightOpen,
  Play,
  Settings,
  Trash2,
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

type ServerStatus = "checking" | "connected" | "disconnected";

export default function Popup({
  mode = "popup",
}: {
  mode?: "popup" | "sidebar";
}) {
  const [tabUrl, setTabUrl] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [status, setStatus] = useState<SendResult | null>(null);
  const [sending, setSending] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [maxHeight, setMaxHeight] = useState(defaultSettings.maxHeight);
  const [codec, setCodec] = useState(defaultSettings.codec);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const youtubeId = getYoutubeId(tabUrl);
  const thumbUrl = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : null;
  const isPlaylist = isPlaylistUrl(tabUrl);
  // Firefox has no sidePanel API — hide the "open in sidebar" shortcut there.
  const canOpenSidePanel = typeof chrome.sidePanel?.open === "function";

  useEffect(() => {
    try {
      chrome.runtime.sendMessage("check-server");
    } catch {
      /* ignore */
    }

    chrome.storage.sync.get(defaultSettings).then((opts) => {
      if (opts.maxHeight) setMaxHeight(opts.maxHeight);
      if (opts.codec) setCodec(opts.codec);
    });

    getHistory().then(setHistory);

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) setTabUrl(tab.url);
      if (tab?.title) setTabTitle(tab.title);
    });

    checkServerHealth()
      .then((ok) => setServerStatus(ok ? "connected" : "disconnected"))
      .catch(() => setServerStatus("disconnected"));
  }, []);

  const handlePlay = async (url: string, title: string) => {
    if (!url.trim() || sending) return;
    setSending(true);
    setStatus(null);
    try {
      const result = await sendUrl(url);
      setStatus(result);
      if (result.success) {
        addHistory(url, title);
        const updated = [
          { url, title, timestamp: Date.now() },
          ...history.filter((e) => e.url !== url),
        ].slice(0, 20);
        setHistory(updated);
        setTimeout(() => setStatus(null), 2000);
      }
    } finally {
      setSending(false);
    }
  };

  const handlePlayCurrent = () => handlePlay(tabUrl, tabTitle);

  const dot =
    serverStatus === "connected" ? (
      <span
        className="size-2 shrink-0 rounded-full bg-green-500 ring-2 ring-green-500/20"
        title="Server connected"
      />
    ) : serverStatus === "disconnected" ? (
      <span
        className="size-2 shrink-0 rounded-full bg-red-500 ring-2 ring-red-500/20"
        title="Server not found"
      />
    ) : (
      <Loader2 className="size-3 animate-spin text-muted-foreground" />
    );

  return (
    <div
      className={
        mode === "popup"
          ? "w-80 rounded-xl border bg-card text-card-foreground shadow-sm"
          : "min-h-full bg-background text-card-foreground"
      }
    >
      {mode === "sidebar" && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card/95 px-4 py-3 backdrop-blur">
          <img
            src={chrome.runtime.getURL("play-logo.png")}
            alt=""
            className="size-6 shrink-0"
          />
          <span className="text-sm font-semibold tracking-tight">
            media-launcher
          </span>
          {dot}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => chrome.runtime.openOptionsPage()}
              title="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        className={
          mode === "popup"
            ? "space-y-3 p-3"
            : "mx-auto w-full max-w-md space-y-4 p-4"
        }
      >
        {mode === "popup" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight">
                media-launcher
              </span>
              {dot}
            </div>
            <div className="flex items-center gap-1">
              {canOpenSidePanel && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    const [tab] = await chrome.tabs.query({
                      active: true,
                      currentWindow: true,
                    });
                    if (tab?.windowId) {
                      await chrome.sidePanel.open({ windowId: tab.windowId });
                    }
                  }}
                  title="Open in sidebar"
                >
                  <PanelRightOpen className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => chrome.runtime.openOptionsPage()}
                title="Settings"
              >
                <Settings className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {tabUrl && (
          <div
            className={
              mode === "popup"
                ? "flex items-start gap-2.5 rounded-lg border bg-muted/40 p-2"
                : "flex items-start gap-3 rounded-xl border bg-card p-3"
            }
          >
            {thumbUrl && (
              <img
                src={thumbUrl}
                alt={tabTitle || "Video thumbnail"}
                className={
                  mode === "popup"
                    ? "size-11 shrink-0 rounded-md object-cover shadow-xs"
                    : "size-16 shrink-0 rounded-lg object-cover shadow-sm"
                }
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {isPlaylist && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Playlist
                  </span>
                )}
                {tabTitle && (
                  <p
                    className={
                      mode === "popup"
                        ? "truncate text-xs font-medium leading-tight"
                        : "truncate text-sm font-medium leading-tight"
                    }
                  >
                    {tabTitle}
                  </p>
                )}
              </div>
              <p
                className={
                  mode === "popup"
                    ? "mt-0.5 truncate text-[11px] text-muted-foreground"
                    : "mt-1 truncate text-xs text-muted-foreground"
                }
              >
                {tabUrl}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Resolution
              </span>
              <Select
                value={maxHeight}
                onValueChange={(v) => {
                  if (v) setMaxHeight(v);
                  chrome.storage.sync.set({ maxHeight: v });
                }}
              >
                <SelectTrigger
                  className={
                    mode === "popup"
                      ? "h-8 w-full text-xs"
                      : "h-9 w-full text-sm"
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2160">4K</SelectItem>
                  <SelectItem value="1440">1440p</SelectItem>
                  <SelectItem value="1080">1080p</SelectItem>
                  <SelectItem value="720">720p</SelectItem>
                  <SelectItem value="480">480p</SelectItem>
                  <SelectItem value="a">Audio only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Codec
              </span>
              <Select
                value={codec}
                onValueChange={(v) => {
                  if (v) setCodec(v);
                  chrome.storage.sync.set({ codec: v });
                }}
              >
                <SelectTrigger
                  className={
                    mode === "popup"
                      ? "h-8 w-full text-xs"
                      : "h-9 w-full text-sm"
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="h264">H.264</SelectItem>
                  <SelectItem value="vp9">VP9</SelectItem>
                  <SelectItem value="av1">AV1</SelectItem>
                  <SelectItem value="h265">H.265</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Falls back to the best available option if the video doesn't offer
            the selected quality or codec.
          </p>
        </div>

        <Button
          size={mode === "popup" ? "sm" : "default"}
          className="w-full gap-1.5"
          onClick={handlePlayCurrent}
          disabled={sending || !tabUrl}
        >
          {sending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Sending...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Play className="size-3.5 fill-current" />
              {isPlaylist ? "Play playlist" : "Play with Media Launcher"}
            </span>
          )}
        </Button>

        {status && !status.success && (
          <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{status.error}</span>
          </div>
        )}
        {status?.success && (
          <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-2 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-3.5" />
            <span>Sent to player</span>
          </div>
        )}

        {history.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <History className="size-3" />
                <span>Recent</span>
                <button
                  type="button"
                  className="ml-auto flex items-center gap-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Clear history"
                  onClick={async () => {
                    await clearHistory();
                    setHistory([]);
                  }}
                >
                  <Trash2 className="size-3" />
                  <span className="text-[10px]">Clear</span>
                </button>
              </div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {history.slice(0, 10).map((entry) => (
                  <button
                    type="button"
                    key={entry.url + entry.timestamp}
                    onClick={() => handlePlay(entry.url, entry.title)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={entry.url}
                  >
                    {entry.title || entry.url}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
