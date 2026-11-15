# media-launcher

[![CI](https://github.com/riad-boussaid/media-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/riad-boussaid/media-launcher/actions/workflows/ci.yml)

Send videos from your browser to an external media player (mpv) with one click.

## Architecture

| Component | Directory | Tech |
|-----------|-----------|------|
| API server | server/ | Hono, Drizzle ORM, better-sqlite3 |
| Desktop app | desktop/ | Electron, React, Tailwind CSS |
| Chrome extension | extensions/chrome/ | Chrome, Edge, Brave |
| Firefox extension | extensions/firefox/ | Firefox |
| Shared extension code | extensions/shared/ | Imported by both extensions via `@shared` |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- mpv media player

### Build & Run

```bash
# Install dependencies
pnpm install
pnpm -C server install
pnpm -C desktop install

# API server
cd server
pnpm dev

# Desktop app
cd desktop
pnpm dev

# Chrome extension
cd extensions/chrome
pnpm install
pnpm build

# Firefox extension
cd extensions/firefox
pnpm install
pnpm build
```

## Security

The API server binds to `127.0.0.1` only, rejects requests with non-loopback
`Host` headers (DNS-rebinding defense), and requires a shared auth token on
every route except `GET /api/health`.

The token is generated on first run and stored next to the database:

- **Desktop app:** Settings → API token → Copy
- **Standalone server:** `server/data/auth-token` (or override with the
  `AUTH_TOKEN` / `DATA_DIR` / `HOST` / `PORT` env vars)

Paste the token into the browser extension's options page (Server → API
token). Requests without a valid token get `401`.

## Development

```bash
# Lint
pnpm lint

# Type check
pnpm type-check

# Format
pnpm format
```

## Loading the extension

### Chrome
1. Go to chrome://extensions
2. Enable Developer mode
3. Click "Load unpacked"
4. Select extensions/chrome/dist

### Firefox
1. Go to about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on"
3. Select extensions/firefox/dist/manifest.json

After loading, open the extension options and paste the API token from the
desktop app's Settings page.

## License

MIT
