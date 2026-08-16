import { useState } from "react";
import { getSettings } from "../lib/api";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function Play() {
  const [urlInput, setUrlInput] = useState("");
  const [toast, setToast] = useState("");
  const [playing, setPlaying] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handlePlay = async () => {
    const url = urlInput.trim();
    if (!url || playing) return;
    if (!isValidUrl(url)) {
      showToast("Please enter a valid http(s) URL");
      return;
    }
    setPlaying(true);
    try {
      const settings = await getSettings();
      const res = await fetch(`${settings.serverUrl}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.text();
        showToast(`Error: ${err}`);
        return;
      }
      showToast("Playing...");
      setUrlInput("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Error: ${message}`);
    } finally {
      setPlaying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-lg">
        <h2 className="text-lg font-semibold text-text mb-1">Play a video</h2>
        <p className="text-xs text-muted mb-4">
          Paste a URL from YouTube or any supported site
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 px-4 py-3 border border-border-light rounded-lg bg-card text-text text-sm outline-none focus:border-accent transition-colors placeholder:text-muted"
            type="text"
            placeholder="Paste a URL and press Enter..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePlay();
            }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handlePlay}
            disabled={!urlInput.trim() || playing}
          >
            {playing ? "Sending..." : "Play"}
          </button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
