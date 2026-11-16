# Firefox reviewer notes

Media Launcher is a client for a companion desktop app that runs on the user's
own machine. The extension does not contact a developer-operated service.

## How to test without installing mpv

The extension UI and local API work without mpv; playback itself returns an
error until mpv is installed.

1. Clone <https://github.com/riad-boussaid/media-launcher>.
2. Install Node.js 20+ and pnpm.
3. Run:

   ```bash
   pnpm -C server install
   pnpm -C server dev
   ```

   This starts the API on `http://127.0.0.1:5000`. It writes a generated API
   token to `<repo>/server/data/auth-token`; alternatively set `AUTH_TOKEN` in
   the environment. If port 5000 is occupied, run with
   `PORT=5001 pnpm -C server dev`.
4. Load the extension temporarily from `extensions/firefox/dist/manifest.json`
   (`about:debugging#/runtime/this-firefox`).
5. Open the extension options, paste the token, and click **Detect server**.
   The status should read **Server found**.
6. Open a YouTube video page. The in-page play button appears in the action row;
   the toolbar popup also shows the current tab and a **Play** button.
7. Clicking Play sends the URL to the local server. Without mpv the request
   returns a readable error in the popup/notification; with mpv installed the
   video opens in mpv.

## Notes for reviewers

- All extension requests go to the server URL configured in options. The
  default is `http://localhost:5000`; ports 5000–5010 are probed during
  discovery.
- The API token is stored in `storage.local`, not `storage.sync`.
- The content script runs on all pages to detect video elements, but transmits
  nothing until the user plays or queues a video.
- No remote code is loaded. SponsorBlock is an optional mpv Lua script installed
  by the desktop app, not by the extension.
- The Firefox build uses `background.scripts` (MV3), `sidebar_action`, and the
  `browser_specific_settings.gecko.id` `media-launcher@riad-boussaid`.
- `data_collection_permissions.required` is `["none"]` because the developer
  does not receive any user data; the companion server is user-controlled.

## Source layout

- `extensions/firefox` — Firefox build and UI
- `extensions/shared` — shared extension logic
- `server` — local API server (Hono + SQLite)
- `desktop` — Electron app that embeds the server
