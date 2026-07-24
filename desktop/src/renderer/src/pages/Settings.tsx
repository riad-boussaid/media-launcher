import { useEffect, useState } from "react";
import type { DownloadItem, Settings } from "../lib/api";
import {
  checkPlayer,
  deleteDownload,
  getDownloads,
  getSettings,
  openExternal,
  setSettings,
  startDownload,
} from "../lib/api";

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

export default function SettingsPage() {
  const [settings, setLocal] = useState<Settings | null>(null);
  const [toast, setToast] = useState("");
  const [playerStatus, setPlayerStatus] = useState<
    "unknown" | "ok" | "missing"
  >("unknown");
  const [checking, setChecking] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setLocal(s);
      verifyPlayer(s);
    });
    refreshDownloads();
  }, [verifyPlayer, refreshDownloads]);

  const refreshDownloads = async () => {
    setDownloads(await getDownloads());
  };

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await startDownload(id);
    } catch {
    } finally {
      setDownloadingId(null);
      refreshDownloads();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDownload(id);
    refreshDownloads();
  };

  const verifyPlayer = async (s: Settings) => {
    const exe = PLAYER_EXE[s.player]?.(s);
    if (!exe) return;
    setChecking(true);
    const ok = await checkPlayer(exe);
    setPlayerStatus(ok ? "ok" : "missing");
    setChecking(false);
  };

  if (!settings) return null;

  const save = async () => {
    await setSettings(settings);
    setToast("Settings saved");
    setTimeout(() => setToast(""), 2000);
  };

  const update = (partial: Partial<Settings>) => {
    const next = {
      ...settings,
      ...partial,
      playerArgs: { ...settings.playerArgs, ...(partial.playerArgs || {}) },
    };
    setLocal(next);
    if (
      partial.player !== undefined ||
      partial.customPlayerPath !== undefined
    ) {
      verifyPlayer(next);
    }
  };

  const statusIcon = checking
    ? "..."
    : playerStatus === "ok"
      ? "\u2705"
      : playerStatus === "missing"
        ? "\u274C"
        : "";

  return (
    <div>
      <div className="mb-5">
        <label className="block text-xs text-label mb-1.5 uppercase tracking-[0.5px]">
          Server URL
        </label>
        <input
          type="text"
          value={settings.serverUrl}
          onChange={(e) => update({ serverUrl: e.target.value })}
          placeholder="http://localhost:5000"
          className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors"
        />
      </div>

      <div className="mb-5">
        <label className="block text-xs text-label mb-1.5 uppercase tracking-[0.5px]">
          Media player{" "}
          {statusIcon && <span className="ml-1.5 text-sm">{statusIcon}</span>}
        </label>
        <select
          className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors appearance-none cursor-pointer pr-8 bg-no-repeat"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundPosition: "right 10px center",
          }}
          value={settings.player}
          onChange={(e) => update({ player: e.target.value })}
        >
          {PLAYERS.map((p) => (
            <option
              key={p.value}
              value={p.value}
              className="bg-surface text-text"
            >
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {playerStatus === "missing" && (
        <p className="text-[11px] text-danger mb-3">
          Player executable not found in PATH. Install it or switch to a
          different player.
        </p>
      )}

      {settings.player !== "custom" && (
        <div className="mb-5">
          <label className="block text-xs text-label mb-1.5 uppercase tracking-[0.5px]">
            Extra arguments for{" "}
            {PLAYERS.find((p) => p.value === settings.player)?.label ||
              settings.player}
          </label>
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
            className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors"
          />
        </div>
      )}

      {settings.player === "custom" && (
        <>
          <div className="mb-5">
            <label className="block text-xs text-label mb-1.5 uppercase tracking-[0.5px]">
              Player executable path
            </label>
            <input
              type="text"
              value={settings.customPlayerPath}
              onChange={(e) => update({ customPlayerPath: e.target.value })}
              placeholder="e.g. C:\Players\myplayer.exe"
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="mb-5">
            <label className="block text-xs text-label mb-1.5 uppercase tracking-[0.5px]">
              Command arguments
            </label>
            <input
              type="text"
              value={settings.customPlayerArgs}
              onChange={(e) => update({ customPlayerArgs: e.target.value })}
              placeholder={"use {url} as placeholder, e.g. --play {url}"}
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-text text-sm outline-none focus:border-accent transition-colors"
            />
            <p className="text-[11px] text-muted mt-1">
              Use <code className="text-accent text-xs">{`{url}`}</code> as a
              placeholder for the video URL
            </p>
          </div>
        </>
      )}

      <div className="mb-5">
        <label className="flex items-center text-sm text-text normal-case tracking-normal">
          <input
            type="checkbox"
            className="w-auto mr-2"
            checked={settings.autoStart}
            onChange={(e) => update({ autoStart: e.target.checked })}
          />
          Start on boot
        </label>
      </div>

      <div className="mb-5">
        <label className="flex items-center text-sm text-text normal-case tracking-normal">
          <input
            type="checkbox"
            className="w-auto mr-2"
            checked={settings.startMinimized}
            onChange={(e) => update({ startMinimized: e.target.checked })}
          />
          Start minimized to tray
        </label>
      </div>

      <div className="flex gap-2 mt-2">
        <button className="btn-primary" onClick={save}>
          Save
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <hr className="border-none border-t border-border my-5" />

      <h3 className="m-0 mb-1 text-sm font-semibold text-text">Downloads</h3>
      <p className="text-[11px] text-[#777] m-0 mb-4">
        Download portable binaries to the app's data directory. No admin rights
        needed. Downloaded binaries are used automatically instead of
        system-installed ones.
      </p>

      {downloads.map((d) => (
        <div
          key={d.id}
          className="flex justify-between items-center bg-card p-3 rounded-lg mb-2.5 gap-3"
        >
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <strong>{d.name}</strong>
            <span className="text-[11px] text-[#999] leading-tight">
              {d.description}
            </span>
            <span className="text-[10px] text-[#666]">
              {d.size}
              {d.platform
                ? ` \u2022 ${d.platform}`
                : " \u2022 not available on this platform"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {d.platform ? (
              d.systemAvailable ? (
                <span className="text-[11px] text-accent whitespace-nowrap">
                  Already on system
                </span>
              ) : d.canDownload ? (
                d.installed ? (
                  <button
                    className="px-3 py-1 text-xs bg-surface border border-border rounded-lg text-muted cursor-pointer hover:bg-[#444]"
                    onClick={() => handleDelete(d.id)}
                  >
                    Remove
                  </button>
                ) : d.status === "downloading" || downloadingId === d.id ? (
                  <span className="text-xs text-accent">Downloading...</span>
                ) : (
                  <button
                    className="btn-primary px-3 py-1 text-xs"
                    onClick={() => handleDownload(d.id)}
                  >
                    Download
                  </button>
                )
              ) : d.url ? (
                <button
                  className="px-3 py-1 text-xs bg-surface border border-border rounded-lg text-muted cursor-pointer hover:bg-[#444]"
                  onClick={() => openExternal(d.url!)}
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
      ))}
    </div>
  );
}
