export interface HistoryEntry {
  url: string;
  title: string;
  timestamp: number;
}

const HISTORY_KEY = "media-launcher-history";
const MAX_ENTRIES = 20;

export async function getHistory(): Promise<HistoryEntry[]> {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  return data[HISTORY_KEY] ?? [];
}

export async function addHistory(url: string, title: string): Promise<void> {
  const history = await getHistory();
  const filtered = history.filter((e) => e.url !== url);
  filtered.unshift({ url, title, timestamp: Date.now() });
  if (filtered.length > MAX_ENTRIES) filtered.length = MAX_ENTRIES;
  await chrome.storage.local.set({ [HISTORY_KEY]: filtered });
}
