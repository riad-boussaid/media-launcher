# media-launcher

Send videos from your browser to an external media player (mpv) with one click.

## Architecture

| Component | Directory | Tech |
|-----------|-----------|------|
| API server | server/ | Hono, Drizzle ORM, better-sqlite3 |
| Desktop app | desktop/ | Electron, React, Tailwind CSS |
| Chrome extension | extensions/chrome/ | Chrome, Edge, Brave |
| Firefox extension | extensions/firefox/ | Firefox |

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
npm install
npm run build
```

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

## License

MIT
