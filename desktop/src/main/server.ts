import { type ChildProcess, execSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { app } from "electron";

let serverProcess: ChildProcess | null = null;
let ownsServer = false;

function getServerEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "server", "index.js");
  }
  return join(__dirname, "../../../server/dist/index.js");
}

function getServerUrl(): string {
  return "http://localhost:5000";
}

// The embedded server stores its database and auth token here. Overriding
// DATA_DIR keeps writes out of the (read-only) install directory.
function getDataDir(): string {
  return join(app.getPath("userData"), "server-data");
}

function getTokenPath(): string {
  return join(getDataDir(), "auth-token");
}

/**
 * Whether the "Remote control" toggle is on — persisted in the local config
 * next to serverUrl so the spawn environment knows the bind address before
 * the server (and its settings API) exists.
 */
function isRemoteEnabled(): boolean {
  try {
    const parsed = JSON.parse(
      readFileSync(join(app.getPath("userData"), "config.json"), "utf-8"),
    ) as { remoteEnabled?: boolean };
    return parsed.remoteEnabled === true;
  } catch {
    return false;
  }
}

export interface RemoteUrls {
  /** Pairing link over the LAN (Wi-Fi/Ethernet). */
  lan: string | null;
  /** Pairing link over Tailscale (works from outside the LAN too). */
  tailscale: string | null;
}

const REMOTE_TOKEN_RANGE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/;

function pairingLink(ip: string, token: string): string {
  return `http://${ip}:5000/remote?t=${encodeURIComponent(token)}`;
}

/**
 * Pairing links per transport: the LAN IP (Wi-Fi/Ethernet) and the machine's
 * Tailscale IP when its adapter is up. Null entries mean that transport
 * isn't currently available; remoteEnabled off means both are null.
 */
export function getRemoteUrls(): RemoteUrls {
  if (!isRemoteEnabled()) return { lan: null, tailscale: null };
  // Pick the most likely LAN address. Skips loopback, link-local (169.254 —
  // adapters with no network) and virtual adapters (Hyper-V/WSL/Docker)
  // whose addresses the phone usually can't reach. Tailscale's own adapter
  // is handled separately below.
  const candidates: string[] = [];
  let tailscaleIp: string | null = null;
  for (const [name, list] of Object.entries(networkInterfaces())) {
    const isTailscale = /tailscale/i.test(name);
    if (/vethernet|wsl|docker|virtual/i.test(name)) continue;
    for (const ni of list ?? []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (ni.address.startsWith("169.254.")) continue;
      if (isTailscale && REMOTE_TOKEN_RANGE.test(ni.address)) {
        tailscaleIp = ni.address;
        continue;
      }
      candidates.push(ni.address);
    }
  }
  const token = readServerToken() ?? "";
  const lanIp =
    candidates.find((ip) => ip.startsWith("192.168.")) ??
    candidates.find((ip) => ip.startsWith("10.")) ??
    candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ??
    candidates[0] ??
    null;
  return {
    lan: lanIp ? pairingLink(lanIp, token) : null,
    tailscale: tailscaleIp ? pairingLink(tailscaleIp, token) : null,
  };
}

/**
 * The token the embedded server requires on every route except /api/health.
 * AUTH_TOKEN env passthrough covers talking to an externally started server.
 */
export function readServerToken(): string | null {
  const envToken = process.env.AUTH_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    return readFileSync(getTokenPath(), "utf-8").trim() || null;
  } catch {
    return null;
  }
}

interface HealthResponse {
  app?: string;
  pid?: number;
}

async function probeHealth(timeoutMs = 1500): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${getServerUrl()}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as HealthResponse;
    return data.app === "media-launcher" ? data : null;
  } catch {
    return null;
  }
}

/** Lightweight liveness probe for the renderer's status indicator. */
export async function getServerStatus(): Promise<{ online: boolean }> {
  const health = await probeHealth(1000);
  return { online: health !== null };
}

/** Probe an arbitrary server URL (used by Settings' "Test connection"). */
export async function probeServerUrl(
  url: string,
): Promise<{ ok: boolean; detail?: string }> {
  const base = url.trim().replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = (await res.json()) as HealthResponse;
    if (data.app !== "media-launcher") {
      return { ok: false, detail: "Reached a server, but not media-launcher" };
    }
    return { ok: true };
  } catch {
    return { ok: false, detail: "No response" };
  }
}

export async function startServer(): Promise<void> {
  const entry = getServerEntry();
  if (!existsSync(entry)) {
    console.warn("Server entry not found:", entry);
    return;
  }

  // A server may already be running (standalone, or leaked from a previous
  // session). If it responds, adopt it without spawning a duplicate.
  const existing = await probeHealth();
  if (existing && existing.pid !== undefined) {
    console.log(
      `Server already running (pid ${existing.pid}); adopting without spawning.`,
    );
    ownsServer = false;
    return;
  }

  // Run the server on Electron's bundled Node instead of a system `node`,
  // which end users won't have. Server output goes to a log file.
  let logFd: number | null = null;
  try {
    const logDir = app.getPath("logs");
    mkdirSync(logDir, { recursive: true });
    logFd = openSync(join(logDir, "server.log"), "a");
  } catch {
    logFd = null;
  }

  const proc = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DATA_DIR: getDataDir(),
      // Remote control binds all interfaces; otherwise loopback only.
      ...(isRemoteEnabled() ? { HOST: "0.0.0.0" } : {}),
    },
    stdio: ["ignore", logFd ?? "ignore", logFd ?? "ignore"],
    detached: false,
  });
  if (logFd !== null) {
    // The child holds its own duplicate of the handle; release ours.
    try {
      closeSync(logFd);
    } catch {
      /* ignore */
    }
  }
  serverProcess = proc;

  proc.on("error", (err) => {
    console.error("Server process error:", err);
    serverProcess = null;
  });

  proc.on("exit", () => {
    if (serverProcess === proc) serverProcess = null;
  });

  const start = Date.now();
  while (Date.now() - start < 10000) {
    const health = await probeHealth();
    if (health && health.pid === proc.pid) {
      ownsServer = true;
      console.log(`Server ready (pid ${proc.pid}).`);
      return;
    }
    // If something else answered, our spawn is about to die from EADDRINUSE.
    if (health) {
      console.warn(
        `Port 5000 is owned by another process (pid ${health.pid}); not adopting.`,
      );
      serverProcess = null;
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.warn("Server did not become ready within timeout; see server.log");
  serverProcess = null;
}

export function stopServer(): void {
  if (!ownsServer || !serverProcess?.pid) return;
  const pid = serverProcess.pid;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } catch {
      serverProcess.kill("SIGKILL");
    }
  } else {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
  ownsServer = false;
}
