const HEALTH_ENDPOINT = "/api/health";
const DEFAULT_PORT = 5000;
const MAX_PORT = 5010;

/** API version this extension build understands. */
export const EXPECTED_SERVER_API_VERSION = 1;

interface ServerHealth {
  app?: string;
  version?: string;
  apiVersion?: number;
}

export interface DiscoveryResult {
  serverUrl: string;
  port: number;
  version?: string;
  apiVersion?: number;
}

function toDiscoveryResult(
  serverUrl: string,
  port: number,
  health: ServerHealth,
): DiscoveryResult {
  return {
    serverUrl,
    port,
    version: typeof health.version === "string" ? health.version : undefined,
    apiVersion:
      typeof health.apiVersion === "number" ? health.apiVersion : undefined,
  };
}

async function probePort(
  port: number,
  signal?: AbortSignal,
): Promise<ServerHealth | null> {
  try {
    const res = await fetch(`http://localhost:${port}${HEALTH_ENDPOINT}`, {
      signal: signal ?? AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ServerHealth;
    return data.app === "media-launcher" ? data : null;
  } catch {
    return null;
  }
}

export async function discoverServer(
  preferredUrl?: string,
  signal?: AbortSignal,
): Promise<DiscoveryResult | null> {
  if (preferredUrl) {
    try {
      const url = preferredUrl.replace(/\/+$/, "");
      const res = await fetch(`${url}${HEALTH_ENDPOINT}`, {
        signal: signal ?? AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as ServerHealth;
        if (data.app === "media-launcher") {
          return toDiscoveryResult(url, Number(new URL(url).port), data);
        }
      }
    } catch {
      /* fall through to probing */
    }
  }

  // Probe the whole range concurrently: a local server should be found in one
  // round-trip instead of waiting through up to eleven sequential timeouts.
  const ports = Array.from(
    { length: MAX_PORT - DEFAULT_PORT + 1 },
    (_, index) => DEFAULT_PORT + index,
  );
  const results = await Promise.all(
    ports.map((port) => probePort(port, signal)),
  );
  const index = results.findIndex((health) => health !== null);
  if (index === -1) return null;

  const port = ports[index];
  const health = results[index];
  if (!health) return null;
  return toDiscoveryResult(`http://localhost:${port}`, port, health);
}
