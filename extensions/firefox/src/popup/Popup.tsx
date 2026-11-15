import { useEffect, useState } from "react";
import { checkServerHealth, type SendResult, sendUrl } from "@/lib/api";
import {
  addHistory,
  clearHistory,
  getHistory,
  type HistoryEntry,
} from "@/lib/history";
import { defaultSettings } from "@/lib/settings";
import { isPlaylistUrl } from "@/lib/url";

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

const s = {
  wrap: {
    width: "320px",
    borderRadius: "12px",
    border: "1px solid #2a2a3e",
    background: "#18181b",
    color: "#e4e4e7",
  } as React.CSSProperties,
  wrapSidebar: {
    minHeight: "100%",
    background: "#18181b",
    color: "#e4e4e7",
  } as React.CSSProperties,
  inner: {
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  } as React.CSSProperties,
  title: {
    fontSize: "14px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    margin: 0,
  } as React.CSSProperties,
  dot: (c: string) =>
    ({
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: c,
      flexShrink: 0,
      boxShadow: `0 0 0 2px ${c}33`,
    }) as React.CSSProperties,
  tabCard: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    borderRadius: "8px",
    border: "1px solid #27272a",
    background: "#27272a66",
    padding: "8px",
  } as React.CSSProperties,
  thumb: {
    width: "44px",
    height: "44px",
    borderRadius: "6px",
    objectFit: "cover",
    flexShrink: 0,
  } as React.CSSProperties,
  tabInfo: {
    minWidth: 0,
    flex: 1,
  } as React.CSSProperties,
  tabTitle: {
    fontSize: "12px",
    fontWeight: 500,
    margin: 0,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,
  badge: {
    flexShrink: 0,
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#a1a1aa",
    background: "#27272a",
    borderRadius: "4px",
    padding: "2px 6px",
  } as React.CSSProperties,
  tabUrl: {
    fontSize: "11px",
    color: "#a1a1aa",
    margin: "2px 0 0 0",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as React.CSSProperties,
  select: {
    width: "100%",
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid #27272a",
    background: "#18181b",
    color: "#e4e4e7",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box",
  } as React.CSSProperties,
  selectLabel: {
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#a1a1aa",
  } as React.CSSProperties,
  selectHint: {
    fontSize: "11px",
    lineHeight: 1.4,
    color: "#71717a",
    margin: 0,
  } as React.CSSProperties,
  btn: {
    width: "100%",
    padding: "8px 0",
    border: "none",
    borderRadius: "8px",
    background: "#3b82f6",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  } as React.CSSProperties,
  btnDisabled: {
    width: "100%",
    padding: "8px 0",
    border: "none",
    borderRadius: "8px",
    background: "#27272a",
    color: "#71717a",
    fontSize: "13px",
    fontWeight: 600,
  } as React.CSSProperties,
  errorBox: {
    display: "flex",
    gap: "6px",
    alignItems: "flex-start",
    borderRadius: "6px",
    background: "#7f1d1d33",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#fca5a5",
    lineHeight: 1.4,
  } as React.CSSProperties,
  successBox: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
    borderRadius: "6px",
    background: "#14532d33",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#86efac",
  } as React.CSSProperties,
  separator: {
    height: "1px",
    background: "#27272a",
    margin: 0,
    border: "none",
  } as React.CSSProperties,
  historyLabel: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "#a1a1aa",
    marginBottom: "4px",
  } as React.CSSProperties,
  historyClear: {
    fontSize: "10px",
    color: "#a1a1aa",
    background: "none",
    border: "none",
    borderRadius: "4px",
    padding: "1px 6px",
    cursor: "pointer",
  } as React.CSSProperties,
  historyItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    fontSize: "12px",
    color: "#a1a1aa",
    background: "none",
    border: "none",
    borderRadius: "6px",
    padding: "3px 6px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "background 0.15s",
  } as React.CSSProperties,
  historyScroll: {
    maxHeight: "112px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  } as React.CSSProperties,
  settingsBtn: {
    background: "none",
    border: "none",
    color: "#a1a1aa",
    cursor: "pointer",
    padding: "2px",
    fontSize: "16px",
    lineHeight: 1,
  } as React.CSSProperties,
};

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

  const indicator =
    serverStatus === "connected" ? (
      <span style={s.dot("#22c55e")} title="Server connected" />
    ) : serverStatus === "disconnected" ? (
      <span style={s.dot("#ef4444")} title="Server not found" />
    ) : (
      <span style={{ fontSize: "11px", color: "#a1a1aa" }}>⋯</span>
    );

  return (
    <div style={mode === "sidebar" ? s.wrapSidebar : s.wrap}>
      <div
        style={mode === "sidebar" ? { ...s.inner, padding: "16px" } : s.inner}
      >
        {mode === "sidebar" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              paddingBottom: "12px",
              borderBottom: "1px solid #27272a",
            }}
          >
            <p style={s.title}>media-launcher</p>
            {indicator}
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              <button
                type="button"
                style={s.settingsBtn}
                onClick={() => chrome.runtime.openOptionsPage()}
                title="Settings"
              >
                ⚙
              </button>
            </div>
          </div>
        )}

        {mode === "popup" && (
          <div style={s.header}>
            <div style={s.headerLeft}>
              <p style={s.title}>media-launcher</p>
              {indicator}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                style={s.settingsBtn}
                onClick={() => {
                  void (
                    chrome as typeof chrome & {
                      sidebarAction: { open: () => Promise<void> };
                    }
                  ).sidebarAction
                    .open()
                    .catch(() => {});
                }}
                title="Open in sidebar"
              >
                ☰
              </button>
              <button
                type="button"
                style={s.settingsBtn}
                onClick={() => chrome.runtime.openOptionsPage()}
                title="Settings"
              >
                ⚙
              </button>
            </div>
          </div>
        )}

        {tabUrl && (
          <div style={s.tabCard}>
            {thumbUrl && (
              <img
                src={thumbUrl}
                alt={tabTitle || "Video thumbnail"}
                style={
                  mode === "sidebar"
                    ? { ...s.thumb, width: "64px", height: "64px" }
                    : s.thumb
                }
              />
            )}
            <div style={s.tabInfo}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {isPlaylist && <span style={s.badge}>Playlist</span>}
                {tabTitle && <p style={s.tabTitle}>{tabTitle}</p>}
              </div>
              <p style={s.tabUrl}>{tabUrl}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={s.selectLabel}>Resolution</span>
              <select
                style={s.select}
                value={maxHeight}
                onChange={(e) => {
                  setMaxHeight(e.target.value);
                  chrome.storage.sync.set({ maxHeight: e.target.value });
                }}
              >
                <option value="2160">4K</option>
                <option value="1440">1440p</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
                <option value="a">Audio only</option>
              </select>
            </div>

            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span style={s.selectLabel}>Codec</span>
              <select
                style={s.select}
                value={codec}
                onChange={(e) => {
                  setCodec(e.target.value);
                  chrome.storage.sync.set({ codec: e.target.value });
                }}
              >
                <option value="any">Any</option>
                <option value="h264">H.264</option>
                <option value="vp9">VP9</option>
                <option value="av1">AV1</option>
                <option value="h265">H.265</option>
              </select>
            </div>
          </div>
          <p style={s.selectHint}>
            Falls back to the best available option if the video doesn't offer
            the selected quality or codec.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePlayCurrent}
          disabled={sending || !tabUrl}
          style={sending || !tabUrl ? s.btnDisabled : s.btn}
        >
          {sending
            ? "Sending..."
            : isPlaylist
              ? "▶ Play playlist"
              : "▶ Play with Media Launcher"}
        </button>

        {status && !status.success && (
          <div style={s.errorBox}>✗ {status.error}</div>
        )}
        {status?.success && <div style={s.successBox}>✓ Sent to player</div>}

        {history.length > 0 && (
          <>
            <hr style={s.separator} />
            <div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span style={s.historyLabel}>🕐 Recent</span>
                <button
                  type="button"
                  style={s.historyClear}
                  onClick={async () => {
                    await clearHistory();
                    setHistory([]);
                  }}
                >
                  ✕ Clear
                </button>
              </div>
              <div style={s.historyScroll}>
                {history.slice(0, 10).map((entry) => (
                  <button
                    type="button"
                    key={entry.url + entry.timestamp}
                    onClick={() => handlePlay(entry.url, entry.title)}
                    style={s.historyItem}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#27272a")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
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
