import QRCode from "qrcode";
import {
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  DownloadItem,
  ProbeResult,
  Settings,
  UpdateCheck,
} from "../lib/api";
import {
  checkPlayer,
  checkUpdate,
  deleteDownload,
  getDownloads,
  getRemoteSessions,
  getRemoteUrls,
  getSettings,
  openExternal,
  pickExecutable,
  probeServerUrl,
  type RemoteSessionInfo,
  type RemoteUrls,
  revokeAllRemoteSessions,
  revokeRemoteSession,
  setSettings,
  startDownload,
} from "../lib/api";
import { useTheme } from "../theme-provider";

const PLAYERS = [
  { value: "mpv", label: "mpv" },
  { value: "iina", label: "IINA (macOS)" },
  { value: "potplayer", label: "PotPlayer" },
  { value: "custom", label: "Custom..." },
];

const PLAYER_EXE: Record<string, (s: Settings) => string> = {
  mpv: () => "mpv",
  iina: () => "iina",
  potplayer: () => "PotPlayerMini64",
  custom: (s) => s.customPlayerPath || "mpv",
};

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4 mb-4">
      <h3 className="field-label mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: JSX.Element;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="field-label">{label}</label>
      {children}
      {hint && (
        <p className="text-[11px] text-muted mt-1.5 leading-snug">{hint}</p>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer">
      <span className="toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="track" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm text-text">{label}</span>
        <span className="text-[11px] text-muted leading-snug">
          {description}
        </span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toast, setToast] = useState<{ msg: string; variant: string } | null>(
    null,
  );
  const [playerStatus, setPlayerStatus] = useState<
    "unknown" | "ok" | "missing"
  >("unknown");
  const [checking, setChecking] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [remoteUrls, setRemoteUrls] = useState<RemoteUrls | null>(null);
  const [qrLan, setQrLan] = useState<string | null>(null);
  const [qrTailscale, setQrTailscale] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RemoteSessionInfo[]>([]);
  const [copiedTransport, setCopiedTransport] = useState<
    "lan" | "tailscale" | null
  >(null);
  const [copiedCodeTransport, setCopiedCodeTransport] = useState<
    "lan" | "tailscale" | null
  >(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const { theme, setTheme } = useTheme();

  const loadedRef = useRef(false);
  const settingsRef = useRef<Settings | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, variant = "toast-error") => {
    setToast({ msg, variant });
    setTimeout(() => setToast(null), 2200);
  }, []);

  const loadRemoteUrls = useCallback(
    async (fresh = false, isCancelled?: () => boolean): Promise<RemoteUrls> => {
      try {
        const urls = await getRemoteUrls(fresh);
        if (isCancelled?.()) return urls;
        const lanQr = urls.lan
          ? await QRCode.toDataURL(urls.lan, { margin: 1 })
          : null;
        const tailscaleQr = urls.tailscale
          ? await QRCode.toDataURL(urls.tailscale, { margin: 1 })
          : null;
        if (isCancelled?.()) return urls;
        setRemoteUrls(urls);
        setQrLan(lanQr);
        setQrTailscale(tailscaleQr);
        return urls;
      } catch {
        if (isCancelled?.()) {
          return { lan: null, tailscale: null, expiresAt: null };
        }
        const empty: RemoteUrls = {
          lan: null,
          tailscale: null,
          expiresAt: null,
        };
        setRemoteUrls(empty);
        setQrLan(null);
        setQrTailscale(null);
        return empty;
      }
    },
    [],
  );

  useEffect(() => {
    window.electronAPI.server.getToken().then((t) => setToken(t ?? ""));
  }, []);

  const verifyPlayer = useCallback(async (s: Settings) => {
    const exe = PLAYER_EXE[s.player]?.(s);
    if (!exe) return;
    setChecking(true);
    const ok = await checkPlayer(exe);
    setPlayerStatus(ok ? "ok" : "missing");
    setChecking(false);
  }, []);

  const flushSave = useCallback(
    async (next: Settings) => {
      setSaveState("saving");
      try {
        await setSettings(next);
        setSaveState("saved");
        setTimeout(
          () => setSaveState((s) => (s === "saved" ? "idle" : s)),
          1800,
        );
      } catch (err: unknown) {
        setSaveState("error");
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Save failed: ${message}`);
      }
    },
    [showToast],
  );

  const scheduleSave = useCallback(
    (next: Settings) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("pending");
      saveTimer.current = setTimeout(() => void flushSave(next), 600);
    },
    [flushSave],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    getSettings().then((s) => {
      settingsRef.current = s;
      setLocal(s);
      loadedRef.current = true;
      verifyPlayer(s);
    });
    void getDownloads().then(setDownloads);
    void checkUpdate("yt-dlp")
      .then(setUpdateCheck)
      .catch(() => {});
    // Flush a pending debounced save when leaving the page.
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (loadedRef.current && settingsRef.current) {
          void setSettings(settingsRef.current).catch(() => {});
        }
      }
    };
  }, []);

  const refreshDownloads = useCallback(async () => {
    setDownloads(await getDownloads());
  }, []);

  // Poll while something is downloading so the progress bars move.
  useEffect(() => {
    if (!downloads.some((d) => d.status === "downloading")) return;
    const t = setInterval(() => void refreshDownloads(), 1000);
    return () => clearInterval(t);
  }, [downloads, refreshDownloads]);

  // The remote pairing links (LAN + Tailscale) come from main; the embedded
  // server restarts briefly after the toggle, so poll a few times while on.
  useEffect(() => {
    if (!settings?.remoteEnabled) {
      setRemoteUrls(null);
      setQrLan(null);
      setQrTailscale(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    let quick: ReturnType<typeof setInterval> | null = null;
    const stopQuick = () => {
      if (quick) {
        clearInterval(quick);
        quick = null;
      }
    };
    const load = async () => {
      const urls = await loadRemoteUrls(false, () => cancelled);
      if (cancelled) return;
      // Stop the startup retry loop once the server has answered; each call
      // mints new one-time codes, so don't churn them unnecessarily.
      if (urls.lan || urls.tailscale) stopQuick();
    };
    void load();
    quick = setInterval(() => {
      tries += 1;
      if (tries > 6) {
        stopQuick();
        return;
      }
      void load();
    }, 1500);
    // Codes are one-time; mint a fresh set every minute while this page is
    // open so the visible QR stays usable.
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => {
      cancelled = true;
      stopQuick();
      clearInterval(refresh);
    };
  }, [settings?.remoteEnabled, loadRemoteUrls]);

  // Tick the one-time-code countdown while codes are displayed.
  useEffect(() => {
    if (!remoteUrls?.expiresAt) return;
    setNowTs(Date.now());
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remoteUrls?.expiresAt]);

  // Paired devices: keep the list live while the page is open (phones pair
  // and unpair independently of this page).
  useEffect(() => {
    if (!settings?.remoteEnabled) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void getRemoteSessions().then((list) => {
        if (!cancelled) setSessions(list);
      });
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [settings?.remoteEnabled]);

  const handleRevokeSession = async (id: string) => {
    setSessions(await revokeRemoteSession(id));
  };

  const handleRevokeAllSessions = async () => {
    await revokeAllRemoteSessions();
    setSessions([]);
  };

  const pairBlock = (
    label: string,
    hint: string,
    url: string,
    qr: string,
    transport: "lan" | "tailscale",
  ) => {
    let pairingCode = "";
    try {
      pairingCode = new URL(url).searchParams.get("c") ?? "";
    } catch {
      pairingCode = "";
    }
    const remotePage = url.split("?")[0];
    return (
      <div className="flex flex-wrap items-start gap-3 mt-3 first:mt-2">
        {qr && (
          <img
            src={qr}
            alt={`${label} pairing QR code`}
            className="w-28 h-28 flex-shrink-0 rounded-lg border border-border bg-white p-1"
          />
        )}
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[11px] text-text font-medium leading-snug m-0">
            {label}
          </p>
          <p className="text-[10px] text-muted leading-snug m-0">{hint}</p>
          {pairingCode && (
            <div className="mt-2">
              <div className="text-[9px] text-muted uppercase tracking-[0.06em] font-semibold mb-1">
                One-time code
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1">
                <code className="min-w-0 flex-1 select-all font-mono text-[12px] tracking-[0.08em] text-accent break-all">
                  {pairingCode}
                </code>
                <button
                  type="button"
                  className="btn-ghost btn-sm flex-shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(pairingCode);
                      setCopiedCodeTransport(transport);
                      setTimeout(() => setCopiedCodeTransport(null), 2000);
                    } catch {
                      showToast("Copy failed — select the code manually");
                    }
                  }}
                >
                  {copiedCodeTransport === transport ? "Copied" : "Copy code"}
                </button>
              </div>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopiedTransport(transport);
                  setTimeout(() => setCopiedTransport(null), 2000);
                } catch {
                  showToast("Copy failed — select the URL manually");
                }
              }}
            >
              {copiedTransport === transport ? "Copied" : "Copy link"}
            </button>
            <span className="min-w-0 truncate text-[10px] text-muted">
              {remotePage}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const handleDownload = async (id: string) => {
    try {
      setDownloads(await startDownload(id));
      // Refresh the update badge (a fresh install may close the gap).
      void checkUpdate("yt-dlp")
        .then(setUpdateCheck)
        .catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Download failed: ${message}`);
      void refreshDownloads();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDownload(id);
    void refreshDownloads();
  };

  if (!settings) return null;

  const isHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };
  const urlInvalid =
    settings.serverUrl.trim() !== "" && !isHttpUrl(settings.serverUrl.trim());
  const codeRemainingMs = remoteUrls?.expiresAt
    ? Math.max(0, remoteUrls.expiresAt - nowTs)
    : null;
  const codeRemainingLabel =
    codeRemainingMs === null
      ? null
      : codeRemainingMs > 0
        ? `${Math.floor(codeRemainingMs / 60000)}:${String(
            Math.floor((codeRemainingMs % 60000) / 1000),
          ).padStart(2, "0")}`
        : "Expired";

  const handleProbe = async () => {
    setProbing(true);
    setProbeResult(null);
    setProbeResult(await probeServerUrl(settings.serverUrl));
    setProbing(false);
  };

  const handleBrowsePlayer = async () => {
    const path = await pickExecutable();
    if (!path) return;
    update({ player: "custom", customPlayerPath: path });
  };

  const update = (partial: Partial<Settings>) => {
    const next: Settings = {
      ...settings,
      ...partial,
      playerArgs: { ...settings.playerArgs, ...(partial.playerArgs || {}) },
    };
    settingsRef.current = next;
    setLocal(next);
    scheduleSave(next);
    if (partial.serverUrl !== undefined) setProbeResult(null);
    if (
      partial.player !== undefined ||
      partial.customPlayerPath !== undefined
    ) {
      void verifyPlayer(next);
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Copy failed — select the token manually");
    }
  };

  const statusDot =
    checking || playerStatus === "unknown" ? (
      <span className="inline-block w-[7px] h-[7px] rounded-full bg-[var(--color-muted)] mr-1.5" />
    ) : playerStatus === "ok" ? (
      <span className="status-dot online inline-block mr-1.5" />
    ) : (
      <span className="status-dot offline inline-block mr-1.5" />
    );
  const statusText = checking
    ? "checking…"
    : playerStatus === "ok"
      ? "detected"
      : playerStatus === "missing"
        ? "not found on this system"
        : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-text m-0">Settings</h2>
        {saveState !== "idle" && (
          <span
            className={`flex items-center gap-1.5 text-[11px] ${
              saveState === "error" ? "text-danger" : "text-muted"
            }`}
          >
            {saveState === "pending" || saveState === "saving" ? (
              <>
                <span className="spinner" /> Saving…
              </>
            ) : saveState === "saved" ? (
              <>
                <span className="status-dot online" /> Saved
              </>
            ) : (
              "Not saved"
            )}
          </span>
        )}
      </div>

      <Section title="Appearance">
        <Field
          label="Theme"
          hint={<>System follows your OS light/dark setting.</>}
        >
          <div className="seg" role="radiogroup" aria-label="Theme">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`seg-btn ${theme === t ? "active" : ""}`}
                onClick={() => setTheme(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Connection">
        <Field
          label="Server URL"
          hint={
            urlInvalid ? (
              <span className="text-danger">Enter a valid http(s) URL</span>
            ) : probeResult ? (
              <span className={probeResult.ok ? "text-success" : "text-danger"}>
                {probeResult.ok
                  ? "Server reachable — it's a media-launcher instance"
                  : (probeResult.detail ?? "No response")}
              </span>
            ) : undefined
          }
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.serverUrl}
              onChange={(e) => update({ serverUrl: e.target.value })}
              placeholder="http://localhost:5000"
              className={`input font-mono text-[12px] ${
                urlInvalid ? "border-danger/60" : ""
              }`}
              spellCheck={false}
            />
            <button
              type="button"
              className="btn-ghost flex-shrink-0 disabled:opacity-40 disabled:pointer-events-none"
              disabled={probing || urlInvalid || !settings.serverUrl.trim()}
              onClick={() => void handleProbe()}
            >
              {probing ? "Testing…" : "Test"}
            </button>
          </div>
        </Field>
        <Field
          label="API token"
          hint={
            <>
              Paste this token in the browser extension options so it can talk
              to the server.
            </>
          }
        >
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              readOnly
              value={token}
              className="input pr-[76px] font-mono text-[12px]"
              spellCheck={false}
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-1">
              <button
                type="button"
                className="action-btn"
                title={showToken ? "Hide token" : "Show token"}
                onClick={() => setShowToken((v) => !v)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  {showToken ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="m1 1 22 22" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="action-btn"
                title="Copy token"
                onClick={() => void copyToken()}
              >
                {copied ? (
                  <span className="text-accent text-[11px] font-semibold">
                    Copied
                  </span>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </Field>
      </Section>

      <Section title="Remote control">
        <ToggleRow
          label="Allow devices on this network"
          description="Serve a mobile remote page on your LAN so phones can send URLs and control playback."
          checked={settings.remoteEnabled}
          onChange={(checked) => update({ remoteEnabled: checked })}
        />
        {settings.remoteEnabled && (
          <p className="text-[10px] text-muted leading-snug mt-2 mb-0">
            Use this on a trusted LAN or over Tailscale. The LAN page is plain
            HTTP; Tailscale encrypts the connection.
          </p>
        )}
        {settings.remoteEnabled && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-[0.06em] font-semibold text-muted">
              One-time pairing
            </span>
            <div className="flex items-center gap-2">
              {codeRemainingLabel && (
                <span
                  className={`text-[10px] ${
                    codeRemainingMs === 0 ? "text-danger" : "text-muted"
                  }`}
                >
                  {codeRemainingMs === 0
                    ? "Expired — click New code"
                    : `Expires in ${codeRemainingLabel}`}
                </span>
              )}
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => void loadRemoteUrls(true)}
              >
                New code
              </button>
            </div>
          </div>
        )}
        {settings.remoteEnabled &&
          (remoteUrls && (remoteUrls.lan || remoteUrls.tailscale) ? (
            <>
              {remoteUrls.lan &&
                qrLan &&
                pairBlock(
                  "On this network",
                  "Scan while your phone is on the same Wi-Fi, or enter the code.",
                  remoteUrls.lan,
                  qrLan,
                  "lan",
                )}
              {remoteUrls.tailscale &&
                qrTailscale &&
                pairBlock(
                  "Via Tailscale — works anywhere",
                  "Scan while signed in to Tailscale on the phone, or enter the code.",
                  remoteUrls.tailscale,
                  qrTailscale,
                  "tailscale",
                )}
              {sessions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] text-muted uppercase tracking-[0.06em] font-semibold">
                      Paired devices
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-danger hover:underline"
                      onClick={() => void handleRevokeAllSessions()}
                    >
                      Unpair all
                    </button>
                  </div>
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 py-1">
                      <span className="text-xs text-text flex-1 truncate">
                        {s.device}
                      </span>
                      <span className="text-[10px] text-muted flex-shrink-0">
                        seen{" "}
                        {new Date(s.lastSeen).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        className="text-[10px] text-danger hover:underline flex-shrink-0"
                        onClick={() => void handleRevokeSession(s.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted leading-snug mt-2 mb-0">
                Can't scan? Copy the link to your phone, or open the remote page
                and enter the pairing code. The QR refreshes every minute with a
                new one-time code that expires after five minutes.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-warning leading-snug m-0">
              No pairing link yet — check that the server is running and that
              Wi-Fi/Ethernet or Tailscale is connected.
            </p>
          ))}
      </Section>

      <Section title="Playback">
        <Field
          label="Media player"
          hint={
            statusText ? (
              <span
                className={
                  playerStatus === "missing" ? "text-warning" : "text-muted"
                }
              >
                {statusDot}
                {PLAYERS.find((p) => p.value === settings.player)?.label ||
                  settings.player}{" "}
                {statusText}
                {playerStatus === "missing" &&
                  settings.player === "mpv" &&
                  " — you can download a portable copy in Downloads below"}
              </span>
            ) : undefined
          }
        >
          <select
            className="input select"
            value={settings.player}
            onChange={(e) => update({ player: e.target.value })}
          >
            {PLAYERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        {playerStatus === "missing" && (
          <div className="flex items-center justify-between gap-3 mb-3 -mt-1">
            <p className="text-[11px] text-warning leading-snug m-0">
              Player executable not found in PATH. Install it, download it
              below, or locate it manually.
            </p>
            {settings.player !== "custom" && (
              <button
                type="button"
                className="btn-ghost flex-shrink-0"
                onClick={() => void handleBrowsePlayer()}
              >
                Browse…
              </button>
            )}
          </div>
        )}

        {settings.player !== "custom" && (
          <Field
            label={`Extra arguments for ${
              PLAYERS.find((p) => p.value === settings.player)?.label ||
              settings.player
            }`}
          >
            <input
              type="text"
              value={settings.playerArgs[settings.player] || ""}
              onChange={(e) =>
                update({
                  playerArgs: {
                    ...settings.playerArgs,
                    [settings.player]: e.target.value,
                  },
                })
              }
              placeholder="e.g. --volume=50 --ytdl-format=best"
              className="input"
              spellCheck={false}
            />
          </Field>
        )}

        {settings.player === "custom" && (
          <>
            <Field label="Player executable path">
              <input
                type="text"
                value={settings.customPlayerPath}
                onChange={(e) => update({ customPlayerPath: e.target.value })}
                placeholder="e.g. C:\Players\myplayer.exe"
                className="input"
                spellCheck={false}
              />
            </Field>
            <Field
              label="Command arguments"
              hint={
                <>
                  Use <code className="text-accent">{`{url}`}</code> as a
                  placeholder for the video URL
                </>
              }
            >
              <input
                type="text"
                value={settings.customPlayerArgs}
                onChange={(e) => update({ customPlayerArgs: e.target.value })}
                placeholder="use {url} as placeholder, e.g. --play {url}"
                className="input"
                spellCheck={false}
              />
            </Field>
          </>
        )}

        <ToggleRow
          label="Resume where you left off"
          description="Continue partially watched videos from their last position."
          checked={settings.resumePlayback}
          onChange={(checked) => update({ resumePlayback: checked })}
        />
      </Section>

      <Section title="Startup">
        <ToggleRow
          label="Start on boot"
          description="Launch Media Launcher when you sign in to Windows."
          checked={settings.autoStart}
          onChange={(checked) => update({ autoStart: checked })}
        />
        <ToggleRow
          label="Start minimized to tray"
          description="Open silently in the tray instead of showing the window."
          checked={settings.startMinimized}
          onChange={(checked) => update({ startMinimized: checked })}
        />
      </Section>

      <Section title="Downloads">
        <p className="text-[11px] text-muted -mt-1 mb-3 leading-snug">
          Portable binaries and scripts saved to the app's data directory — no
          admin rights needed. Downloaded copies are used automatically over
          system-installed ones.
        </p>
        {downloads.map((d) => {
          const hasUpdate = d.id === "yt-dlp" && updateCheck?.updateAvailable;
          return (
            <div
              key={d.id}
              className="flex justify-between items-center bg-surface border border-border rounded-lg p-3 mb-2 last:mb-0 gap-3"
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <strong className="text-[13px]">{d.name}</strong>
                <span className="text-[11px] text-muted leading-snug">
                  {d.description}
                </span>
                <span className="text-[10px] text-muted/80">
                  {d.size}
                  {d.platform
                    ? ` \u2022 ${d.platform}`
                    : " \u2022 not available on this platform"}
                </span>
                {hasUpdate && (
                  <span className="text-[10px] text-warning mt-0.5">
                    Update available: v{updateCheck?.installedVersion} → v
                    {updateCheck?.latestVersion}
                  </span>
                )}
                {d.status === "downloading" && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="progress-track flex-1">
                      <div
                        className={`progress-fill ${
                          d.progress === null || d.progress < 0
                            ? "indeterminate"
                            : ""
                        }`}
                        style={
                          d.progress !== null && d.progress >= 0
                            ? { width: `${Math.round(d.progress * 100)}%` }
                            : undefined
                        }
                      />
                    </div>
                    <span className="text-[10px] text-accent whitespace-nowrap">
                      {d.progress !== null && d.progress >= 0
                        ? `${Math.round(d.progress * 100)}%`
                        : "…"}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {d.platform ? (
                  d.systemAvailable ? (
                    <span className="text-[11px] text-success whitespace-nowrap">
                      On system
                    </span>
                  ) : d.canDownload ? (
                    d.status === "downloading" ? (
                      <span className="text-xs text-accent">Downloading…</span>
                    ) : !d.installed ? (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => void handleDownload(d.id)}
                      >
                        Download
                      </button>
                    ) : hasUpdate ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => void handleDelete(d.id)}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => void handleDownload(d.id)}
                        >
                          Update
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => void handleDelete(d.id)}
                      >
                        Remove
                      </button>
                    )
                  ) : d.url ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        if (d.url) void openExternal(d.url);
                      }}
                    >
                      Website
                    </button>
                  ) : null
                ) : (
                  <span className="text-xs text-muted">N/A</span>
                )}
                {d.status === "error" && d.error && (
                  <span className="text-[11px] text-danger" title={d.error}>
                    Error
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </Section>

      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}
