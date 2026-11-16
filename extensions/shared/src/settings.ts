import { ext } from "./ext";

export interface Settings {
  serverUrl: string;
  authToken: string;
  maxHeight: string;
  codec: string;
  mpvArgs: string;
  showThumb: boolean;
  volume: number;
  speed: number;
  subLang: string;
  loop: boolean;
  showPageButton: boolean;
  showThumbButtons: boolean;
  notifications: boolean;
}

export const defaultSettings: Settings = {
  serverUrl: "http://localhost:5000",
  authToken: "",
  maxHeight: "a",
  codec: "any",
  mpvArgs: "",
  showThumb: false,
  volume: 100,
  speed: 1,
  subLang: "",
  loop: false,
  showPageButton: true,
  showThumbButtons: true,
  notifications: true,
};

// Everything except the token can live in sync storage. The token is moved to
// local storage so it never leaves the device through the browser's account
// sync.
const syncDefaults: Omit<Settings, "authToken"> = {
  serverUrl: defaultSettings.serverUrl,
  maxHeight: defaultSettings.maxHeight,
  codec: defaultSettings.codec,
  mpvArgs: defaultSettings.mpvArgs,
  showThumb: defaultSettings.showThumb,
  volume: defaultSettings.volume,
  speed: defaultSettings.speed,
  subLang: defaultSettings.subLang,
  loop: defaultSettings.loop,
  showPageButton: defaultSettings.showPageButton,
  showThumbButtons: defaultSettings.showThumbButtons,
  notifications: defaultSettings.notifications,
};

/**
 * Reads the API token from local storage, migrating the legacy sync-stored
 * token (and removing it from sync) the first time it is seen.
 */
export async function getAuthToken(): Promise<string> {
  const local = await ext.storage.local.get({ authToken: "" });
  const token = typeof local.authToken === "string" ? local.authToken : "";
  if (token) return token;

  const synced = await ext.storage.sync.get({ authToken: "" });
  const legacy = typeof synced.authToken === "string" ? synced.authToken : "";
  if (!legacy) return "";

  await ext.storage.local.set({ authToken: legacy });
  await ext.storage.sync.remove("authToken");
  return legacy;
}

export async function setAuthToken(token: string): Promise<void> {
  await ext.storage.local.set({ authToken: token });
  await ext.storage.sync.remove("authToken");
}

export async function migrateAuthToken(): Promise<void> {
  await getAuthToken();
}

export async function getSettings(): Promise<Settings> {
  const [synced, authToken] = await Promise.all([
    ext.storage.sync.get(syncDefaults),
    getAuthToken(),
  ]);
  return {
    ...defaultSettings,
    ...synced,
    authToken,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const { authToken, ...rest } = settings;
  await Promise.all([ext.storage.sync.set(rest), setAuthToken(authToken)]);
}
