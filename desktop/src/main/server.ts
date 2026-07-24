import { type ChildProcess, spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

let serverProcess: ChildProcess | null = null;

function getServerEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "server", "index.js");
  }
  return join(__dirname, "../../../server/dist/index.js");
}

function getServerUrl(): string {
  return "http://localhost:5000";
}

async function waitForServer(timeout = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${getServerUrl()}/api/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export async function startServer(): Promise<void> {
  const entry = getServerEntry();
  if (!existsSync(entry)) {
    console.warn("Server entry not found:", entry);
    return;
  }

  serverProcess = spawn("node", [entry], {
    stdio: "ignore",
    detached: false,
  });

  serverProcess.on("error", (err) => {
    console.error("Server process error:", err);
    serverProcess = null;
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
  });

  const ready = await waitForServer();
  if (!ready) {
    console.warn("Server did not become ready within timeout");
  }
}

export function stopServer(): void {
  if (serverProcess) {
    if (process.platform === "win32" && serverProcess.pid) {
      try {
        execSync(`taskkill /F /T /PID ${serverProcess.pid}`, { stdio: "ignore" });
      } catch {
        serverProcess.kill("SIGKILL");
      }
    } else {
      serverProcess.kill("SIGTERM");
    }
    serverProcess = null;
  }
}
