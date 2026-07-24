const HEALTH_ENDPOINT = "/api/health";
const DEFAULT_PORT = 5000;
const MAX_PORT = 5010;

export interface DiscoveryResult {
  serverUrl: string;
  port: number;
}

async function probePort(port: number, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}${HEALTH_ENDPOINT}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.app === "media-launcher";
  } catch {
    return false;
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
        signal,
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.app === "media-launcher") {
          return {
            serverUrl: url,
            port: new URL(url).port as unknown as number,
          };
        }
      }
    } catch {
      /* fall through to probing */
    }
  }

  const controller = new AbortController();
  const combinedSignal = signal
    ? (AbortSignal.any?.([signal, controller.signal]) ?? signal)
    : controller.signal;

  for (let port = DEFAULT_PORT; port <= MAX_PORT; port++) {
    if (combinedSignal.aborted) break;
    const found = await probePort(port, combinedSignal);
    if (found) {
      controller.abort();
      return { serverUrl: `http://localhost:${port}`, port };
    }
  }

  return null;
}
