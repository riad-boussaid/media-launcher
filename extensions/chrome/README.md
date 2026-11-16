# media-launcher Chrome Extension

Browser extension for Chrome, Edge, and Brave that sends videos from pages to
an external player (mpv) through the media-launcher API server.

The server is written in TypeScript (Hono + SQLite) and lives in `server/`. The
desktop app embeds it.

## Development

Run from the repository root:

```bash
pnpm install
pnpm -C extensions/chrome install
pnpm dev:chrome
```

## Build

```bash
pnpm build:chrome
```

Output goes to `extensions/chrome/dist/`.

## Package a release archive

```bash
pnpm package:chrome
```

Writes `artifacts/media-launcher-chrome-<version>.zip` with `manifest.json` at
the archive root, ready for the Chrome Web Store or manual distribution.

## Load in Chrome

1. Go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extensions/chrome/dist/` directory.

See the repository [README](../../README.md) for setup and the
[release guide](../../docs/releasing.md) for store submission.
