import {
  CheckCircle2,
  History,
  Loader2,
  Play,
  Settings,
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
import { checkServerHealth, type SendResult, sendUrl } from "@/lib/api";
import { addHistory, getHistory, type HistoryEntry } from "@/lib/history";
import { defaultSettings } from "@/lib/settings";

function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

type ServerStatus = "checking" | "connected" | "disconnected";

export default function Popup() {
  const [tabUrl, setTabUrl] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [status, setStatus] = useState<SendResult | null>(null);
  const [sending, setSending] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [maxHeight, setMaxHeight] = useState(defaultSettings.maxHeight);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const youtubeId = getYoutubeId(tabUrl);
  const thumbUrl = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : null;

  useEffect(() => {
    try {
      chrome.runtime.sendMessage("check-server");
    } catch {
      /* ignore */
    }

    chrome.storage.sync.get(defaultSettings).then((opts) => {
      if (opts.maxHeight) setMaxHeight(opts.maxHeight);
    });

    getHistory().then(setHistory);

    chrome.tabs.query({ active: true }).then(([tab]) => {
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
    const result = await sendUrl(url);
    setStatus(result);
    setSending(false);
    if (result.success) {
      addHistory(url, title);
      const updated = [
        { url, title, timestamp: Date.now() },
        ...history.filter((e) => e.url !== url),
      ].slice(0, 20);
      setHistory(updated);
      setTimeout(() => setStatus(null), 2000);
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
    <div className="w-80 rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tracking-tight">
              media-launcher
            </span>
            {dot}
          </div>
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

        {tabUrl && (
          <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-2">
            {thumbUrl && (
              <img
                src={thumbUrl}
                alt={tabTitle || "Video thumbnail"}
                className="size-11 shrink-0 rounded-md object-cover shadow-xs"
              />
            )}
            <div className="min-w-0 flex-1">
              {tabTitle && (
                <p className="truncate text-xs font-medium leading-tight">
                  {tabTitle}
                </p>
              )}
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {tabUrl}
              </p>
            </div>
          </div>
        )}

        <Select
          value={maxHeight}
          onValueChange={(v) => {
            if (v) setMaxHeight(v);
            chrome.storage.sync.set({ maxHeight: v });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
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

        <Button
          size="sm"
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
              <Play className="size-3.5 fill-current" /> Play with Media
              Launcher
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
              <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <History className="size-3" />
                <span>Recent</span>
              </div>
              <div className="max-h-28 space-y-0.5 overflow-y-auto">
                {history.slice(0, 5).map((entry) => (
                  <button
                    type="button"
                    key={entry.url + entry.timestamp}
                    onClick={() => handlePlay(entry.url, entry.title)}
                    className="w-full truncate rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
