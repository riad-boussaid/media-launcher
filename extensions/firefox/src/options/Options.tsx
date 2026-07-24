import { useCallback, useEffect, useState } from "react";
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

export default function Options() {
  const [serverUrl, setServerUrl] = useState(defaultSettings.serverUrl);
  const [maxHeight, setMaxHeight] = useState(defaultSettings.maxHeight);
  const [mpvArgs, setMpvArgs] = useState(defaultSettings.mpvArgs);
  const [showThumb, setShowThumb] = useState(defaultSettings.showThumb);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<boolean | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

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
    } else {
      setDiscovered(false);
    }
    setDiscovering(false);
  }, [serverUrl]);

  const saveOptions = async () => {
    try {
      await chrome.storage.sync.set({
        serverUrl,
        maxHeight,
        mpvArgs,
        showThumb,
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
    setServerUrl(defaultSettings.serverUrl);
    setMaxHeight(defaultSettings.maxHeight);
    setMpvArgs(defaultSettings.mpvArgs);
    setShowThumb(defaultSettings.showThumb);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const restoreOptions = useCallback(async () => {
    const opts = (await chrome.storage.sync.get(defaultSettings)) as Settings;
    setServerUrl(opts.serverUrl);
    setMaxHeight(opts.maxHeight);
    setMpvArgs(opts.mpvArgs);
    setShowThumb(opts.showThumb);
  }, []);

  useEffect(() => {
    restoreOptions();
  }, [restoreOptions]);

  useEffect(() => {
    if (serverUrl && serverUrl === defaultSettings.serverUrl) {
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
          One per line. Appended after the auto-generated flags.
        </p>
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
