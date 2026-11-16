// Firefox only guarantees Promise-based WebExtension APIs on the `browser`
// namespace; its `chrome` namespace is callback-oriented. Chrome's `chrome`
// namespace returns Promises for the MV3 APIs we use. Prefer `browser` when
// the host provides it so the same awaited calls work in both browsers.
interface BrowserGlobals {
  browser?: typeof chrome;
}

export const ext: typeof chrome =
  (globalThis as unknown as BrowserGlobals).browser ?? chrome;
