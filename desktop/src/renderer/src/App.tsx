import { type JSX, useCallback, useEffect, useState } from "react";
import { getServerStatus } from "./lib/api";
import History from "./pages/History";
import Play from "./pages/Play";
import Settings from "./pages/Settings";
import "./index.css";

type Tab = "play" | "history" | "settings";

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const TABS: { key: Tab; label: string; icon: () => JSX.Element }[] = [
  { key: "play", label: "Play", icon: PlayIcon },
  { key: "history", label: "History", icon: HistoryIcon },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("play");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [searchSignal, setSearchSignal] = useState(0);

  const pollStatus = useCallback(async () => {
    try {
      const { online } = await getServerStatus();
      setServerOnline(online);
    } catch {
      setServerOnline(false);
    }
  }, []);

  useEffect(() => {
    void pollStatus();
    const t = setInterval(() => void pollStatus(), 5000);
    return () => clearInterval(t);
  }, [pollStatus]);

  useEffect(() => {
    const cleanup = window.electronAPI.window.onNavigate((t) => {
      if (t === "play" || t === "history" || t === "settings") setTab(t);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "1") {
        e.preventDefault();
        setTab("play");
      } else if (key === "2") {
        e.preventDefault();
        setTab("history");
        setSearchSignal((n) => n + 1);
      } else if (key === "3") {
        e.preventDefault();
        setTab("settings");
      } else if (key === "f") {
        e.preventDefault();
        setTab("history");
        setSearchSignal((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-base">
      <div className="titlebar h-9 flex-shrink-0 flex items-center px-3 gap-2 bg-surface border-b border-border">
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="var(--color-accent)"
          aria-hidden="true"
        >
          <polygon points="7 4 21 12 7 20 7 4" />
        </svg>
        <span className="text-[12px] text-text-dim font-medium select-none">
          media-launcher
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        <nav className="w-[64px] flex-shrink-0 flex flex-col items-center gap-1 bg-surface border-r border-border py-3">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                title={t.label}
                className={`w-[52px] py-2.5 flex flex-col items-center gap-1 rounded-lg border-none cursor-pointer transition-colors duration-150 ${
                  active
                    ? "bg-card text-accent"
                    : "bg-transparent text-muted hover:text-text hover:bg-card"
                }`}
                onClick={() => setTab(t.key)}
              >
                <t.icon />
                <span className="text-[10px] font-medium leading-none">
                  {t.label}
                </span>
              </button>
            );
          })}

          <div
            className="mt-auto flex flex-col items-center gap-1.5 pt-2"
            title={
              serverOnline === null
                ? "Checking server…"
                : serverOnline
                  ? "Server running on port 5000"
                  : "Server not responding"
            }
          >
            <span
              className={`status-dot ${
                serverOnline === null ? "" : serverOnline ? "online" : "offline"
              }`}
              style={
                serverOnline === null
                  ? { background: "var(--color-muted)" }
                  : undefined
              }
            />
            <span className="text-[9px] text-muted leading-none">
              {serverOnline ? ":5000" : "offline"}
            </span>
          </div>
        </nav>

        <main
          key={tab}
          className="flex-1 overflow-y-auto px-4 py-4 animate-[pageIn_0.2s_ease-out]"
        >
          {tab === "play" && <Play />}
          {tab === "history" && <History focusSignal={searchSignal} />}
          {tab === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
