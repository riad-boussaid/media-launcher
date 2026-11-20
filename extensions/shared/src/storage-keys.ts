/**
 * Local-storage keys shared between the background worker and content
 * scripts. Kept in their own module so content scripts can observe a cache
 * without importing the server client.
 */
export const WATCH_LATER_CACHE_KEY = "media-launcher-watch-later-cache";
