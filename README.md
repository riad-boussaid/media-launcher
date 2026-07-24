# media-launcher

Send videos from your browser to an external media player (mpv) with one click.

## Architecture

| Component | Directory | Platform |
|-----------|-----------|----------|
| Chrome extension | extensions/chrome/ | Chrome, Edge, Brave |
| Firefox extension | extensions/firefox/ | Firefox |
| Go server | go-server/ | Cross-platform |
| Desktop app | desktop/ | Windows (Electron) |

## Quick Start

### Prerequisites

- Node.js 20+
- Go 1.22+
- pnpm (for Chrome extension)
- mpv media player

### Build & Run

```bash
# Go server
cd go-server
go run .

# Chrome extension
cd extensions/chrome
pnpm install
pnpm build

# Firefox extension
cd extensions/firefox
npm install
npm run build

# Desktop app
cd desktop
npm install
npm run dev
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