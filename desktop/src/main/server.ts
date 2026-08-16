import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
    const data: HealthResponse = await res.json();
    return data.app === "media-launcher" ? data : null;
  } catch {
    return null;
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

  const proc = spawn("node", [entry], {
    stdio: "ignore",
    detached: false,
  });
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

  console.warn("Server did not become ready within timeout");
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
