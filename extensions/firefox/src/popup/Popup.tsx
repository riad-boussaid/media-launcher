import { sendUrl, checkServerHealth, type SendResult } from "@/lib/api";
import { getHistory, addHistory, type HistoryEntry } from "@/lib/history";
import { defaultSettings } from "@/lib/settings";
import { useState, useEffect } from "react";

function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
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
    try { chrome.runtime.sendMessage("check-server"); } catch { /* ignore */ }

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

  const indicator =
    serverStatus === "connected" ? (
      <span style={s.dot("#22c55e")} title="Server connected" />
    ) : serverStatus === "disconnected" ? (
      <span style={s.dot("#ef4444")} title="Server not found" />
    ) : (
      <span style={{ fontSize: "11px", color: "#a1a1aa" }}>⋯</span>
    );

  return (
    <div style={s.wrap}>
      <div style={s.inner}>
        <div style={s.header}>
          <div style={s.headerLeft}>
            <p style={s.title}>media-launcher</p>
            {indicator}
          </div>
          <button
            style={s.settingsBtn}
            onClick={() => chrome.runtime.openOptionsPage()}
            title="Settings"
          >
            ⚙
          </button>
        </div>

        {tabUrl && (
          <div style={s.tabCard}>
            {thumbUrl && <img src={thumbUrl} style={s.thumb} />}
            <div style={s.tabInfo}>
              {tabTitle && <p style={s.tabTitle}>{tabTitle}</p>}
              <p style={s.tabUrl}>{tabUrl}</p>
            </div>
          </div>
        )}

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

        <button
          onClick={handlePlayCurrent}
          disabled={sending || !tabUrl}
          style={sending || !tabUrl ? s.btnDisabled : s.btn}
        >
          {sending ? "Sending..." : "▶ Play with Media Launcher"}
        </button>

        {status && !status.success && (
          <div style={s.errorBox}>✗ {status.error}</div>
        )}
        {status?.success && (
          <div style={s.successBox}>✓ Sent to player</div>
        )}

        {history.length > 0 && (
          <>
            <hr style={s.separator} />
            <div>
              <div style={s.historyLabel}>🕐 Recent</div>
              <div style={s.historyScroll}>
                {history.slice(0, 5).map((entry) => (
                  <button
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
