import { useCallback, useEffect, useRef, useState } from "react";
import { discoverServer } from "@/lib/discovery";
import { defaultSettings, type Settings } from "@/lib/settings";

const styles = {
  page: {
    maxWidth: "500px",
    margin: "0 auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  } as React.CSSProperties,
  heading: {
    fontSize: "24px",
    fontWeight: 600,
    margin: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,
  section: {
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: "13px",
    fontWeight: 600,
    margin: 0,
    color: "#e0e0e0",
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: "12px",
    color: "#888",
    marginBottom: "4px",
  } as React.CSSProperties,
  hint: {
    fontSize: "11px",
    color: "#666",
    margin: 0,
    lineHeight: 1.4,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #333",
    background: "#1e1e2e",
    color: "#e0e0e0",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #333",
    background: "#1e1e2e",
    color: "#e0e0e0",
    fontSize: "13px",
    outline: "none",
    minHeight: "160px",
    resize: "vertical",
    boxSizing: "border-box",
  } as React.CSSProperties,
  select: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #333",
    background: "#1e1e2e",
    color: "#e0e0e0",
    fontSize: "13px",
    outline: "none",
  } as React.CSSProperties,
  serverRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  } as React.CSSProperties,
  btn: {
    padding: "8px 20px",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
  } as React.CSSProperties,
  btnPrimary: {
    padding: "8px 20px",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    background: "#64ffda",
    color: "#1a1a2e",
    fontWeight: 600,
  } as React.CSSProperties,
  btnSecondary: {
    padding: "8px 20px",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    background: "#333",
    color: "#e0e0e0",
  } as React.CSSProperties,
  btnSmall: {
    padding: "6px 12px",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
    background: "#333",
    color: "#e0e0e0",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
    paddingTop: "8px",
  } as React.CSSProperties,
  status: {
    fontSize: "12px",
    color: "#4ade80",
  } as React.CSSProperties,
  error: {
    fontSize: "12px",
    color: "#ff6b6b",
  } as React.CSSProperties,
  dirty: {
    fontSize: "11px",
    color: "#f59e0b",
  } as React.CSSProperties,
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  } as React.CSSProperties,
  discoveryStatus: {
    fontSize: "11px",
    marginTop: "4px",
  } as React.CSSProperties,
};

const MAX_HEIGHTS = ["2160", "1440", "1080", "720", "480", "a"];
const CODECS = ["any", "h264", "vp9", "av1", "h265"];

function isSettingsShape(value: unknown): value is Settings {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.serverUrl === "string" &&
    typeof s.maxHeight === "string" &&
    MAX_HEIGHTS.includes(s.maxHeight) &&
    typeof s.codec === "string" &&
    CODECS.includes(s.codec) &&
    typeof s.mpvArgs === "string" &&
    typeof s.showThumb === "boolean" &&
    typeof s.volume === "number" &&
    s.volume >= 0 &&
    s.volume <= 100 &&
    typeof s.speed === "number" &&
    s.speed >= 0.25 &&
    s.speed <= 3 &&
    typeof s.subLang === "string" &&
    typeof s.loop === "boolean" &&
    (s.authToken === undefined || typeof s.authToken === "string")
  );
}

export default function Options() {
  const [serverUrl, setServerUrl] = useState(defaultSettings.serverUrl);
  const [authToken, setAuthToken] = useState(defaultSettings.authToken);
  const [maxHeight, setMaxHeight] = useState(defaultSettings.maxHeight);
  const [codec, setCodec] = useState(defaultSettings.codec);
  const [mpvArgs, setMpvArgs] = useState(defaultSettings.mpvArgs);
  const [showThumb, setShowThumb] = useState(defaultSettings.showThumb);
  const [volume, setVolume] = useState(defaultSettings.volume);
  const [speed, setSpeed] = useState(defaultSettings.speed);
  const [subLang, setSubLang] = useState(defaultSettings.subLang);
  const [loop, setLoop] = useState(defaultSettings.loop);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<boolean | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const currentSettings = (): Settings => ({
    serverUrl,
    authToken,
    maxHeight,
    codec,
    mpvArgs,
    showThumb,
    volume,
    speed,
    subLang,
    loop,
  });

  const applySettings = (s: Settings) => {
    setServerUrl(s.serverUrl);
    setAuthToken(s.authToken ?? defaultSettings.authToken);
    setMaxHeight(s.maxHeight);
    setCodec(s.codec);
    setMpvArgs(s.mpvArgs);
    setShowThumb(s.showThumb);
    setVolume(s.volume);
    setSpeed(s.speed);
    setSubLang(s.subLang);
    setLoop(s.loop);
  };

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(currentSettings(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "media-launcher-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importSettings = async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isSettingsShape(parsed)) {
        throw new Error("invalid shape");
      }
      applySettings(parsed);
      markDirty();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaved(false);
    }
  };

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const runDiscovery = useCallback(async () => {
    setDiscovering(true);
    setDiscovered(null);
    const result = await discoverServer(serverUrl);
    if (result) {
      setServerUrl(result.serverUrl);
      setDiscovered(true);
      markDirty();
    } else {
      setDiscovered(false);
    }
    setDiscovering(false);
  }, [serverUrl]);

  const saveOptions = async () => {
    try {
      const safeSpeed =
        Number.isFinite(speed) && speed >= 0.25 && speed <= 3
          ? speed
          : defaultSettings.speed;
      await chrome.storage.sync.set({
        serverUrl,
        authToken,
        maxHeight: maxHeight ?? defaultSettings.maxHeight,
        codec,
        mpvArgs,
        showThumb,
        volume,
        speed: safeSpeed,
        subLang,
        loop,
      });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaved(false);
    }
  };

  const resetOptions = async () => {
    await chrome.storage.sync.set(defaultSettings);
    applySettings(defaultSettings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const restoreOptions = useCallback(async () => {
    const opts = (await chrome.storage.sync.get(defaultSettings)) as Settings;
    applySettings(opts);
  }, []);

  useEffect(() => {
    restoreOptions();
  }, [restoreOptions]);

  const hasAutoDiscovered = useRef(false);

  useEffect(() => {
    if (hasAutoDiscovered.current) return;
    if (serverUrl && serverUrl === defaultSettings.serverUrl) {
      hasAutoDiscovered.current = true;
      runDiscovery();
    }
  }, [serverUrl, runDiscovery]);

  const discoveryIndicator = discovering ? (
    <span style={{ color: "#888" }}>Scanning ports 5000–5010...</span>
  ) : discovered === true ? (
    <span style={{ color: "#4ade80" }}>Server found</span>
  ) : discovered === false ? (
    <span style={{ color: "#ff6b6b" }}>Server not found</span>
  ) : null;

  return (
    <div style={styles.page}>
      <div style={styles.heading}>
        media-launcher Options
        {dirty && <span style={styles.dirty}>Unsaved changes</span>}
      </div>

      <div style={styles.section}>
        <p style={styles.sectionTitle}>Server</p>
        <label style={styles.label}>Server URL</label>
        <div style={styles.serverRow}>
          <input
            style={{ ...styles.input, flex: 1 }}
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setDiscovered(null);
              markDirty();
            }}
            placeholder="http://localhost:5000"
          />
          <button type="button" style={styles.btnSmall} onClick={runDiscovery}>
            {discovering ? "..." : "Scan"}
          </button>
        </div>
        <div style={styles.discoveryStatus}>{discoveryIndicator}</div>
        <p style={styles.hint}>
          The desktop app runs a local server. Auto-discovers on ports
          5000–5010.
        </p>
        <label style={styles.label}>API token</label>
        <input
          style={styles.input}
          type="password"
          value={authToken}
          onChange={(e) => {
            setAuthToken(e.target.value);
            markDirty();
          }}
          placeholder="Paste the token from the desktop app"
        />
        <p style={styles.hint}>
          Copy the API token from the desktop app's Settings page. The server
          rejects unauthenticated requests.
        </p>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionTitle}>Playback</p>
        <label style={styles.label}>Maximum resolution</label>
        <select
          style={styles.select}
          value={maxHeight}
          onChange={(e) => {
            setMaxHeight(e.target.value);
            markDirty();
          }}
        >
          <option value="2160">4K</option>
          <option value="1440">1440p</option>
          <option value="1080">1080p</option>
          <option value="720">720p</option>
          <option value="480">480p</option>
          <option value="a">Audio only</option>
        </select>
        <p style={styles.hint}>
          Limits video quality. "Audio only" skips video entirely.
        </p>

        <label style={styles.label}>Preferred codec</label>
        <select
          style={styles.select}
          value={codec}
          onChange={(e) => {
            setCodec(e.target.value);
            markDirty();
          }}
        >
          <option value="any">Any</option>
          <option value="h264">H.264</option>
          <option value="vp9">VP9</option>
          <option value="av1">AV1</option>
          <option value="h265">H.265</option>
        </select>
        <p style={styles.hint}>
          Prefers this video codec, falling back to the best available if the
          video doesn't offer it.
        </p>

        <label style={styles.label}>Volume</label>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              markDirty();
            }}
            style={{ flex: 1 }}
          />
          <span
            style={{
              width: "48px",
              textAlign: "right",
              fontSize: "12px",
              color: "#888",
            }}
          >
            {volume}%
          </span>
        </div>

        <label style={styles.label}>Playback speed</label>
        <input
          type="number"
          min={0.25}
          max={3}
          step={0.05}
          style={styles.input}
          value={speed}
          onChange={(e) => {
            setSpeed(Number(e.target.value));
            markDirty();
          }}
          onBlur={() => {
            const v = Number(speed);
            if (!Number.isFinite(v) || v < 0.25 || v > 3) {
              setSpeed(defaultSettings.speed);
            }
          }}
        />

        <label style={styles.label}>Preferred subtitle language</label>
        <input
          style={styles.input}
          placeholder="en"
          value={subLang}
          onChange={(e) => {
            setSubLang(e.target.value);
            markDirty();
          }}
        />
        <p style={styles.hint}>
          ISO 639-1 code, e.g. en, fr, es. Empty = default.
        </p>

        <div style={styles.checkboxRow}>
          <input
            type="checkbox"
            id="loop"
            checked={loop}
            onChange={(e) => {
              setLoop(e.target.checked);
              markDirty();
            }}
          />
          <label htmlFor="loop" style={{ fontSize: "12px" }}>
            Loop the video
          </label>
        </div>

        {maxHeight === "a" && (
          <div style={styles.checkboxRow}>
            <input
              type="checkbox"
              id="show-thumb"
              checked={showThumb}
              onChange={(e) => {
                setShowThumb(e.target.checked);
                markDirty();
              }}
            />
            <label htmlFor="show-thumb" style={{ fontSize: "12px" }}>
              Show video thumbnail for audio-only playback
            </label>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <p style={styles.sectionTitle}>Advanced</p>
        <label style={styles.label}>Extra MPV arguments</label>
        <textarea
          style={styles.textarea}
          value={mpvArgs}
          onChange={(e) => {
            setMpvArgs(e.target.value);
            markDirty();
          }}
          placeholder="--ytdl-format=bestvideo+bestaudio"
        />
        <p style={styles.hint}>
          One per line. Appended after the auto-generated flags. Playlist tips:
          `--playlist-start=3`, `--loop-playlist=inf`.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            style={styles.btnSmall}
            onClick={exportSettings}
          >
            Export settings
          </button>
          <button
            type="button"
            style={styles.btnSmall}
            onClick={() => importRef.current?.click()}
          >
            Import settings
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importSettings(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid #333",
          margin: 0,
        }}
      />

      <div style={styles.footer}>
        {dirty && (
          <span style={{ fontSize: "11px", color: "#f59e0b" }}>
            You have unsaved changes
          </span>
        )}
        {saved && !dirty && <span style={styles.status}>Options saved.</span>}
        <button
          type="button"
          style={styles.btnSecondary}
          onClick={resetOptions}
        >
          Reset
        </button>
        <button type="button" style={styles.btnPrimary} onClick={saveOptions}>
          Save
        </button>
      </div>
    </div>
  );
}
