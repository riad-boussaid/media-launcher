import { useState } from "react";
import Play from "./pages/Play";
import History from "./pages/History";
import Settings from "./pages/Settings";
import "./index.css";

type Tab = "play" | "history" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "play", label: "Play" },
  { key: "history", label: "History" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("play");

  return (
    <div className="h-screen flex flex-col">
      <header className="flex border-b border-border bg-surface flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`flex-1 py-3 border-none bg-transparent text-muted text-sm cursor-pointer transition-colors duration-200${tab === t.key ? " !text-accent border-b-2 border-accent bg-[#1a1a3e]" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "play" && <Play />}
        {tab === "history" && <History />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}
