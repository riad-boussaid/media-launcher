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
  AppUpdateInfo,
  DownloadItem,
  ProbeResult,
  Settings,
  ToolInfo,
  UpdateCheck,
} from "../lib/api";
import {
  cancelDownload,
  checkAppUpdate,
  checkPlayer,
  checkUpdate,
  deleteDownload,
  getAppUpdateState,
  getAutoUpdateYtDlp,
  getDownloads,
  getPlatform,
  getRemoteSessions,
  getRemoteUrls,
  getSettings,
  getToolInfo,
  importTool,
  openExternal,
  openToolsFolder,
  pickExecutable,
  probeServerUrl,
  type RemoteSessionInfo,
  type RemoteUrls,
  recheckDownloads,
  revealTool,
  revokeAllRemoteSessions,
  revokeRemoteSession,
  setAutoUpdateYtDlp,
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

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${
    units[unit]
  }`;
}

function versionLabel(id: string, version: string | null): string {
  if (!version) return "";
  return id === "yt-dlp" ? `v${version}` : version;
}

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
        <p className="text-[12px] text-muted mt-1.5 leading-snug">{hint}</p>
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
        <span className="text-[12px] text-muted leading-snug">
          {description}
        </span>
      </span>
    </label>
  );
}

function SettingsSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-label="Loading settings"
    >
      {[0, 1, 2].map((index) => (
        <div key={index} className="card p-4 animate-pulse">
          <div className="h-2.5 w-24 rounded bg-elevated mb-4" />
          <div className="h-9 w-full rounded-lg bg-elevated/80 mb-2" />
          <div className="h-9 w-2/3 rounded-lg bg-elevated/60" />
        </div>
      ))}
    </div>
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
  const [toolInfo, setToolInfo] = useState<ToolInfo[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [autoUpdateYtDlp, setAutoUpdateState] = useState(true);
  const [checkingDownloads, setCheckingDownloads] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false);
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
  const [copiedCode, setCopiedCode] = useState(false);
  const [pairTransport, setPairTransport] = useState<"lan" | "tailscale">(
    "lan",
  );
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [settingsError, setSettingsError] = useState(false);
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

  const loadSettings = useCallback(() => {
    setSettingsError(false);
    getSettings()
      .then((s) => {
        settingsRef.current = s;
        setLocal(s);
        loadedRef.current = true;
        verifyPlayer(s);
      })
      .catch(() => setSettingsError(true));
    void getDownloads()
      .then(setDownloads)
      .catch(() => {});
  }, [verifyPlayer]);

  const refreshToolInfo = useCallback(async () => {
    try {
      setToolInfo(await getToolInfo());
    } catch {
      /* leave the last known versions */
    }
  }, []);

  useEffect(() => {
    loadSettings();
    void refreshToolInfo();
    void getAutoUpdateYtDlp()
      .then(setAutoUpdateState)
      .catch(() => {});
    void checkUpdate("yt-dlp")
      .then(setUpdateCheck)
      .catch(() => {});
    void getAppUpdateState()
      .then((info) => {
        setAppUpdate(info);
        if (!info) {
          return checkAppUpdate().then(setAppUpdate);
        }
        return undefined;
      })
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
  }, [loadSettings, refreshToolInfo]);

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
    return () => {
      cancelled = true;
      stopQuick();
    };
  }, [settings?.remoteEnabled, loadRemoteUrls]);

  // Refresh the QR only when its codes are about to expire, so the displayed
  // code stays stable instead of changing every minute.
  useEffect(() => {
    const expiresAt = remoteUrls?.expiresAt;
    if (!expiresAt) return;
    const delay = Math.max(0, expiresAt - Date.now() + 500);
    const timer = setTimeout(() => void loadRemoteUrls(false), delay);
    return () => clearTimeout(timer);
  }, [remoteUrls?.expiresAt, loadRemoteUrls]);

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
          <p className="text-[12px] text-text font-medium leading-snug m-0">
            {label}
          </p>
          <p className="text-[11px] text-muted leading-snug m-0">{hint}</p>
          {pairingCode && (
            <div className="mt-2">
              <div className="text-[10px] text-muted uppercase tracking-[0.06em] font-semibold mb-1">
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
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    } catch {
                      showToast("Copy failed — select the code manually");
                    }
                  }}
                >
                  {copiedCode ? "Copied" : "Copy code"}
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
            <span className="min-w-0 truncate text-[11px] text-muted">
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
      void refreshToolInfo();
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

  const handleCancel = async (id: string) => {
    try {
      const cancelled = await cancelDownload(id);
      if (!cancelled) {
        showToast("Download is finishing up and can't be cancelled");
      }
      await refreshDownloads();
    } catch (err: unknown) {
      showToast(
        `Could not cancel: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDownload(id);
      setConfirmDelete(null);
      void refreshDownloads();
      void refreshToolInfo();
    } catch (err: unknown) {
      showToast(
        `Could not remove tool: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const handleRecheck = async () => {
    try {
      setDownloads(await recheckDownloads());
      await refreshToolInfo();
      showToast("Rechecked installed tools", "toast-success");
    } catch (err: unknown) {
      showToast(
        `Recheck failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleImport = async () => {
    try {
      const id = await importTool();
      if (!id) return;
      await refreshDownloads();
      await refreshToolInfo();
      showToast(`${id} imported`, "toast-success");
    } catch (err: unknown) {
      showToast(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openToolsFolder();
    } catch (err: unknown) {
      showToast(
        `Could not open the tools folder: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const handleReveal = async (path: string) => {
    if (!(await revealTool(path))) {
      showToast("That tool file no longer exists");
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingDownloads(true);
    try {
      const result = await checkUpdate("yt-dlp");
      setUpdateCheck(result);
      showToast(
        !result.installedVersion
          ? "No portable yt-dlp to update — system copies are managed externally"
          : result.updateAvailable
            ? `yt-dlp update available: ${result.installedVersion} → ${result.latestVersion}`
            : "yt-dlp is up to date",
        "toast-success",
      );
    } catch {
      showToast("Could not check for updates");
    } finally {
      setCheckingDownloads(false);
    }
  };

  const handleUpdateAll = async () => {
    if (updateCheck?.updateAvailable) {
      await handleDownload("yt-dlp");
      return;
    }
    await handleCheckUpdates();
  };

  const handleAutoUpdate = async (enabled: boolean) => {
    setAutoUpdateState(enabled);
    try {
      setAutoUpdateState(await setAutoUpdateYtDlp(enabled));
    } catch {
      showToast("Could not save the auto-update setting");
    }
  };

  const handleCheckAppUpdate = async () => {
    setCheckingAppUpdate(true);
    try {
      const info = await checkAppUpdate();
      setAppUpdate(info);
      if (info.error) {
        showToast(`Update check failed: ${info.error}`);
      } else if (info.updateAvailable) {
        showToast(
          `Version ${info.latestVersion} is available`,
          "toast-success",
        );
      } else {
        showToast("media-launcher is up to date", "toast-success");
      }
    } catch {
      showToast("Could not check for updates");
    } finally {
      setCheckingAppUpdate(false);
    }
  };

  const copyInstallCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 1800);
    } catch {
      showToast("Copy failed — select the command manually");
    }
  };

  const platform = getPlatform();
  const infoById = new Map(toolInfo.map((info) => [info.id, info]));
  const downloadById = new Map(downloads.map((item) => [item.id, item]));
  const isReady = (item: DownloadItem) =>
    item.installed || item.systemAvailable;
  const pick = (ids: string[]) =>
    ids
      .map((id) => downloadById.get(id))
      .filter((item): item is DownloadItem => Boolean(item));

  const engine = pick(["mpv", "yt-dlp", "ffmpeg"]);
  const missingManual = engine.filter(
    (item) =>
      !isReady(item) &&
      !item.canDownload &&
      (item.id === "mpv" || item.id === "ffmpeg"),
  );
  const visibleEngine = engine.filter(
    (item) => !missingManual.some((missing) => missing.id === item.id),
  );
  const extras = pick(["sponsorblock"]);
  const otherPlayers = pick(["iina", "potplayer"]).filter(
    (item) => item.platform !== null || isReady(item),
  );
  const installCommand =
    missingManual.length > 0
      ? `${
          platform === "darwin" ? "brew install" : "sudo apt install"
        } ${missingManual.map((item) => item.id).join(" ")}`
      : "";
  const portableBytes = toolInfo
    .filter((info) => info.source === "portable")
    .reduce((sum, info) => sum + (info.sizeBytes ?? 0), 0);
  const portableSize = formatBytes(portableBytes);

  const renderDownload = (d: DownloadItem) => {
    const info = infoById.get(d.id);
    const version = versionLabel(d.id, info?.version ?? null);
    const source =
      info?.source === "portable"
        ? "Portable"
        : info?.source === "system"
          ? "System"
          : null;
    const size = formatBytes(info?.sizeBytes ?? null) || d.size;
    const inUse =
      info?.source !== null &&
      info?.source !== undefined &&
      ((d.id === "mpv" && settings?.player === "mpv") ||
        (d.id === "iina" && settings?.player === "iina") ||
        (d.id === "potplayer" && settings?.player === "potplayer") ||
        d.id === "yt-dlp" ||
        d.id === "ffmpeg");
    const hasUpdate = d.id === "yt-dlp" && updateCheck?.updateAvailable;
    const toolPath = info?.path ?? null;
    const verifiedAt = info?.verifiedAt ?? null;
    const imported = info?.imported ?? false;
    return (
      <div
        key={d.id}
        className="flex justify-between items-center bg-surface border border-border rounded-lg p-3 mb-2 last:mb-0 gap-3"
      >
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <strong className="text-[13px]">{d.name}</strong>
            {version && (
              <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">
                {version}
              </span>
            )}
            {source && (
              <span className="text-[10px] uppercase tracking-[0.05em] text-muted">
                {source}
              </span>
            )}
            {verifiedAt && (
              <span
                className="text-[10px] font-medium text-success"
                title={`Checksum verified ${new Date(
                  verifiedAt,
                ).toLocaleDateString()}`}
              >
                Verified
              </span>
            )}
            {imported && (
              <span className="text-[10px] text-muted">Imported</span>
            )}
            {inUse && (
              <span className="text-[10px] font-medium text-accent">
                In use
              </span>
            )}
          </div>
          <span className="text-[12px] text-muted leading-snug">
            {d.description}
          </span>
          <span className="text-[11px] text-muted/80">
            {size}
            {!d.platform && !isReady(d) ? " · install separately" : ""}
          </span>
          {hasUpdate && (
            <span className="text-[11px] text-warning mt-0.5">
              Update available: v{updateCheck?.installedVersion} → v
              {updateCheck?.latestVersion}
            </span>
          )}
          {d.status === "downloading" && (
            <div className="flex items-center gap-2 mt-1">
              <div
                className="progress-track flex-1"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  d.progress !== null && d.progress >= 0
                    ? Math.round(d.progress * 100)
                    : undefined
                }
                aria-valuetext={
                  d.progress !== null && d.progress >= 0
                    ? `${Math.round(d.progress * 100)}%`
                    : "Downloading"
                }
              >
                <div
                  className={`progress-fill ${
                    d.progress === null || d.progress < 0 ? "indeterminate" : ""
                  }`}
                  style={
                    d.progress !== null && d.progress >= 0
                      ? { width: `${Math.round(d.progress * 100)}%` }
                      : undefined
                  }
                />
              </div>
              <span className="text-[11px] text-accent whitespace-nowrap">
                {d.progress !== null && d.progress >= 0
                  ? `${Math.round(d.progress * 100)}%`
                  : "…"}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {toolPath && (
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded border-none bg-transparent text-muted cursor-pointer transition-colors hover:bg-elevated hover:text-text"
              title="Show in folder"
              aria-label={`Show ${d.name} in folder`}
              onClick={() => void handleReveal(toolPath)}
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </button>
          )}
          {d.status === "downloading" ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => void handleCancel(d.id)}
            >
              Cancel
            </button>
          ) : d.systemAvailable && !d.installed ? (
            <span className="text-[12px] text-success whitespace-nowrap">
              On system
            </span>
          ) : d.canDownload ? (
            !d.installed ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => void handleDownload(d.id)}
              >
                {d.status === "error" ? "Retry" : "Download"}
              </button>
            ) : confirmDelete === d.id ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[11px] font-medium text-danger cursor-pointer hover:underline"
                  onClick={() => void handleDelete(d.id)}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="text-[11px] text-muted cursor-pointer hover:text-text"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {hasUpdate && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => void handleDownload(d.id)}
                  >
                    Update
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setConfirmDelete(d.id)}
                >
                  Remove
                </button>
              </div>
            )
          ) : d.url ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                if (d.url) void openExternal(d.url);
              }}
            >
              Website
            </button>
          ) : d.installed ? (
            <span className="text-[12px] text-success whitespace-nowrap">
              Installed
            </span>
          ) : (
            <span className="text-xs text-muted">Install separately</span>
          )}
          {d.status === "error" && d.error && (
            <span className="text-[12px] text-danger" title={d.error}>
              Error
            </span>
          )}
        </div>
      </div>
    );
  };

  if (!settings) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text m-0">Settings</h2>
        </div>
        {settingsError ? (
          <div className="card p-6 text-center">
            <p className="text-sm font-medium text-text m-0">
              Couldn't load settings
            </p>
            <p className="text-xs text-muted mt-1.5 mb-0">
              The local server may still be starting.
            </p>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={loadSettings}
            >
              Retry
            </button>
          </div>
        ) : (
          <SettingsSkeleton />
        )}
      </div>
    );
  }

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

  const lanPairReady = Boolean(remoteUrls?.lan && qrLan);
  const tailscalePairReady = Boolean(remoteUrls?.tailscale && qrTailscale);
  const activePairTransport: "lan" | "tailscale" =
    pairTransport === "tailscale" && tailscalePairReady
      ? "tailscale"
      : lanPairReady
        ? "lan"
        : "tailscale";
  const activePairUrl =
    activePairTransport === "lan" ? remoteUrls?.lan : remoteUrls?.tailscale;
  const activePairQr = activePairTransport === "lan" ? qrLan : qrTailscale;

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
            className={`flex items-center gap-1.5 text-[12px] ${
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
            <p className="text-[12px] text-warning leading-snug m-0">
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

      <Section title="Remote control">
        <ToggleRow
          label="Allow devices on this network"
          description="Serve a mobile remote page on your LAN so phones can send URLs and control playback."
          checked={settings.remoteEnabled}
          onChange={(checked) => update({ remoteEnabled: checked })}
        />
        {settings.remoteEnabled && (
          <p className="text-[11px] text-muted leading-snug mt-2 mb-0">
            Use this on a trusted LAN or over Tailscale. The LAN page is plain
            HTTP; Tailscale encrypts the connection.
          </p>
        )}
        {settings.remoteEnabled && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted">
              One-time pairing
            </span>
            <div className="flex items-center gap-2">
              {codeRemainingLabel && (
                <span
                  className={`text-[11px] ${
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
              {lanPairReady && tailscalePairReady && (
                <div
                  className="seg mt-3"
                  role="radiogroup"
                  aria-label="Pairing connection"
                >
                  <button
                    type="button"
                    className={`seg-btn ${
                      activePairTransport === "lan" ? "active" : ""
                    }`}
                    onClick={() => {
                      setPairTransport("lan");
                      setCopiedCode(false);
                    }}
                  >
                    LAN
                  </button>
                  <button
                    type="button"
                    className={`seg-btn ${
                      activePairTransport === "tailscale" ? "active" : ""
                    }`}
                    onClick={() => {
                      setPairTransport("tailscale");
                      setCopiedCode(false);
                    }}
                  >
                    Tailscale
                  </button>
                </div>
              )}
              {activePairUrl &&
                activePairQr &&
                pairBlock(
                  activePairTransport === "lan"
                    ? "On this network"
                    : "Via Tailscale — works anywhere",
                  activePairTransport === "lan"
                    ? "Scan while your phone is on the same Wi-Fi, or enter the code."
                    : "Scan while signed in to Tailscale on the phone, or enter the code.",
                  activePairUrl,
                  activePairQr,
                  activePairTransport,
                )}
              {sessions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] text-muted uppercase tracking-[0.06em] font-semibold">
                      Paired devices
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-danger hover:underline"
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
                      <span className="text-[11px] text-muted flex-shrink-0">
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
                        className="text-[11px] text-danger hover:underline flex-shrink-0"
                        onClick={() => void handleRevokeSession(s.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted leading-snug mt-2 mb-0">
                Can't scan? Copy the link to your phone, or open the remote page
                and enter the pairing code. The QR refreshes automatically when
                its one-time code is about to expire; codes last five minutes.
              </p>
            </>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[12px] text-warning leading-snug m-0">
                No pairing link yet — check that the server is running and that
                Wi-Fi/Ethernet or Tailscale is connected.
              </p>
              <button
                type="button"
                className="btn-ghost btn-sm flex-shrink-0"
                onClick={() => void loadRemoteUrls(false)}
              >
                Retry
              </button>
            </div>
          ))}
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
        <p className="text-[12px] text-muted -mt-1 mb-3 leading-snug">
          Portable binaries and scripts saved to the app's data directory — no
          admin rights needed. Downloaded copies are used automatically over
          system-installed ones.
          {portableSize ? ` Portable tools use ${portableSize}.` : ""}
        </p>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-label">
            Playback engine
          </span>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="p-0 text-[11px] text-muted cursor-pointer transition-colors hover:text-text"
              onClick={() => void handleImport()}
            >
              Import binary
            </button>
            <button
              type="button"
              className="p-0 text-[11px] text-muted cursor-pointer transition-colors hover:text-text"
              onClick={() => void handleOpenFolder()}
            >
              Open folder
            </button>
            {updateCheck?.updateAvailable && (
              <span className="text-[10.5px] font-medium text-warning">
                yt-dlp update
              </span>
            )}
            <button
              type="button"
              className="p-0 text-[11px] text-muted cursor-pointer transition-colors hover:text-text disabled:opacity-50"
              disabled={checkingDownloads}
              onClick={() => void handleCheckUpdates()}
            >
              {checkingDownloads ? "Checking…" : "Check updates"}
            </button>
            {updateCheck?.updateAvailable && (
              <button
                type="button"
                className="p-0 text-[11px] font-medium text-accent cursor-pointer transition-colors hover:text-accent-hover"
                onClick={() => void handleUpdateAll()}
              >
                Update all
              </button>
            )}
          </div>
        </div>

        {visibleEngine.map(renderDownload)}

        {installCommand && (
          <div className="mt-2 rounded-lg border border-border bg-surface p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
              {platform === "darwin"
                ? "Install with Homebrew"
                : "Install with your package manager"}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11.5px] text-text-dim">
                {installCommand}
              </code>
              <button
                type="button"
                className="shrink-0 rounded border border-border px-2 py-1 text-[10.5px] text-muted transition-colors hover:border-border-strong hover:text-text"
                onClick={() => void copyInstallCommand(installCommand)}
              >
                {copiedCommand ? "Copied" : "Copy"}
              </button>
            </div>
            {platform === "linux" && (
              <p className="mt-1 mb-0 text-[10.5px] leading-snug text-muted">
                Debian/Ubuntu example — use your distribution's package manager.
              </p>
            )}
            <button
              type="button"
              className="mt-2 p-0 text-[11px] text-accent cursor-pointer hover:underline"
              onClick={() => void openExternal("https://mpv.io/installation/")}
            >
              Installation guide
            </button>
          </div>
        )}

        {extras.length > 0 && (
          <>
            <div className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-label">
              Extras
            </div>
            {extras.map(renderDownload)}
          </>
        )}

        {otherPlayers.length > 0 && (
          <>
            <div className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-label">
              Other players
            </div>
            {otherPlayers.map(renderDownload)}
          </>
        )}

        <div className="mt-3 border-t border-border pt-2">
          <ToggleRow
            label="Keep yt-dlp updated automatically"
            description="Checks at startup and updates the app's portable yt-dlp copy. System installs and manually imported copies are left alone."
            checked={autoUpdateYtDlp}
            onChange={(checked) => void handleAutoUpdate(checked)}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-muted">
              Already installed a tool elsewhere?
            </span>
            <button
              type="button"
              className="p-0 text-[11px] text-muted cursor-pointer transition-colors hover:text-text"
              onClick={() => void handleRecheck()}
            >
              Recheck tools
            </button>
          </div>
        </div>
      </Section>

      <Section title="About">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-text">
              media-launcher
            </div>
            <div className="text-[11.5px] text-muted">
              Version {appUpdate?.currentVersion ?? "…"}
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm flex-shrink-0"
            disabled={checkingAppUpdate}
            onClick={() => void handleCheckAppUpdate()}
          >
            {checkingAppUpdate ? "Checking…" : "Check for updates"}
          </button>
        </div>

        {appUpdate?.updateAvailable ? (
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-accent">
                  Version {appUpdate.latestVersion} is available
                </div>
                {appUpdate.publishedAt && (
                  <div className="text-[10.5px] text-muted">
                    Released{" "}
                    {new Date(appUpdate.publishedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn-primary btn-sm flex-shrink-0"
                onClick={() => {
                  const url =
                    appUpdate.downloadUrl ?? appUpdate.releaseUrl ?? null;
                  if (url) void openExternal(url);
                }}
              >
                Download update
              </button>
            </div>
            {appUpdate.releaseUrl &&
              appUpdate.releaseUrl !== appUpdate.downloadUrl && (
                <button
                  type="button"
                  className="mt-2 p-0 text-[11px] text-accent cursor-pointer hover:underline"
                  onClick={() => {
                    if (appUpdate.releaseUrl) {
                      void openExternal(appUpdate.releaseUrl);
                    }
                  }}
                >
                  Release page
                </button>
              )}
            {appUpdate.notes && (
              <details className="mt-2">
                <summary className="text-[11px] text-muted cursor-pointer hover:text-text">
                  Release notes
                </summary>
                <p className="mt-1 mb-0 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-muted">
                  {appUpdate.notes}
                </p>
              </details>
            )}
          </div>
        ) : (
          <p className="mt-2 mb-0 text-[11.5px] leading-snug text-muted">
            {checkingAppUpdate
              ? "Checking for updates…"
              : appUpdate?.error
                ? "Could not check for updates."
                : appUpdate
                  ? "You're up to date."
                  : "Update status not checked yet."}
          </p>
        )}

        {appUpdate?.error && (
          <p className="mt-1.5 mb-0 text-[11px] leading-snug text-danger">
            {appUpdate.error}
          </p>
        )}
        {appUpdate?.checkedAt && (
          <p className="mt-2 mb-0 text-[10.5px] text-muted">
            Last checked {new Date(appUpdate.checkedAt).toLocaleString()}
          </p>
        )}
      </Section>

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

      <Section title="Advanced">
        <p className="text-[11.5px] text-muted leading-snug mb-3 -mt-1">
          Server URL and extension token — usually leave these as they are.
        </p>
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
                  <span className="text-accent text-[12px] font-semibold">
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

      {toast && <div className={`toast ${toast.variant}`}>{toast.msg}</div>}
    </div>
  );
}
