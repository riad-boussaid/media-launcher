# media-launcher

[![CI](https://github.com/riad-boussaid/media-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/riad-boussaid/media-launcher/actions/workflows/ci.yml)

Send videos from your browser to an external media player (mpv) with one click.

## Features

- **One-click playback** from video pages, thumbnails, playlists, and YouTube Shorts.
- **Queue instead of replace**: Shift-click an in-page button, use the
  Queue context-menu items, or press a keyboard shortcut.
- **Per-page controls**: choose resolution, codec, audio-only mode, subtitles,
  volume, speed, loop, and extra mpv arguments.
- **History and resume**: watch history is stored by the local server and
  partially watched videos resume where they left off.
- **Remote control from a phone**: LAN or Tailscale, with player status,
  seek/pause/skip, chapters, volume, mute, speed, and recent history.
- **SponsorBlock**: optional mpv Lua script, installed from the desktop app's
  Downloads section.
- **Injected-UI controls**: turn the page button, thumbnail buttons, and native
  notifications on or off from the extension settings.
- **Safety first**: the API binds to loopback by default, requires a token, and
  remote pairing uses short-lived codes rather than the master token.

## Supported sites

YouTube (including Shorts), Vimeo, Dailymotion, Twitch, Bilibili, SoundCloud,
Facebook, X/Twitter, Reddit, TikTok, Instagram, Kick, Rumble, and Odysee.

In-page buttons are injected where the site exposes stable player markup.
Thumbnail play chips appear on video cards. Every site remains usable through
the toolbar popup, the right-click menu, and keyboard shortcuts.

## Architecture

| Component | Directory | Tech |
|-----------|-----------|------|
| API server | server/ | Hono, Drizzle ORM, better-sqlite3 |
| Desktop app | desktop/ | Electron, React, Tailwind CSS |
| Chrome extension | extensions/chrome/ | Chrome, Edge, Brave |
| Firefox extension | extensions/firefox/ | Firefox |
| Shared extension code | extensions/shared/ | Imported by both extensions via `@shared` |

The desktop app bundles and starts the API server. The browser extension sends
URLs to that server; the server launches mpv (through yt-dlp) and keeps history,
settings, and a small remote-control server.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- mpv on `PATH`
- yt-dlp on `PATH` (recommended; mpv's ytdl hook also uses it)

### 1. Install dependencies

```bash
pnpm install
pnpm -C server install
pnpm -C desktop install
pnpm -C extensions/chrome install
pnpm -C extensions/firefox install
```

### 2. Start the desktop app (recommended)

```bash
pnpm dev:desktop
```

Or run the standalone API server:

```bash
pnpm -C server dev
```

### 3. Build the browser extension

```bash
pnpm build:chrome
# or: pnpm build:firefox
```

### 4. Load the extension

**Chrome / Edge / Brave**

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `extensions/chrome/dist`.

**Firefox**

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `extensions/firefox/dist/manifest.json`.

## First-run setup

The extension opens its options page on first install.

1. Start the Media Launcher desktop app (or the standalone server).
2. In the desktop app open **Settings → Connection** and copy the **API token**.
3. In the extension options, paste the token into **Server → API token**.
4. Click **Detect server**. The status should read **Server found**.
5. Open any supported video and click the play button, use the toolbar popup,
   right-click the page, or press a shortcut.

The token is stored only in local extension storage and is never synced between
devices. Non-secret preferences (resolution, codec, theme, etc.) use browser
sync storage.

## Using media-launcher

### In the page

- **Video pages**: the play button is added to the site's action row.
- **YouTube Shorts**: a compact **Play** button appears next to the channel
  subscribe button.
- **Thumbnails**: hover a video card for a compact **Play** chip. Clicking it
  sends the video without navigating.
- **Playlists**: pages with a playlist use a playlist-aware button label.
- **Queue**: Shift-click any in-page play button (or the playlist badge) to add
  the video to mpv's queue instead of replacing the current video.

### Toolbar popup

The popup shows the current tab, thumbnail, quality/codec controls, **Play** and
**Add to queue** buttons, and recent history.

### Keyboard shortcuts

| Action | Default shortcut |
|--------|------------------|
| Play the current page | `Alt+Shift+P` |
| Queue the current page | `Alt+Shift+Q` |

Change them at `chrome://extensions/shortcuts` (Chrome) or
`about:addons` → Manage Extension Shortcuts (Firefox).

### Context menu

Right-click a page, link, or video for **Play …** and **Queue …** actions.

## Extension settings

Options are grouped into:

- **Server** — URL and API token.
- **Playback** — max resolution, codec, audio-only, subtitles, volume, speed,
  loop, thumbnail for audio-only, and extra mpv arguments.
- **On-page controls** — show/hide the page button, thumbnail buttons, and
  desktop notifications.
- **Appearance** — light/dark/system theme.

## Remote control

1. In the desktop app open **Settings → Remote control** and enable it.
2. Scan the QR code with a phone on the same LAN (or over Tailscale).
3. The phone can seek, pause, skip, change chapters, volume, mute, speed, and
   play recent history.

QR codes contain a one-time pairing code, not the API token. The desktop mints
a fresh code from the local server for each QR refresh (every minute while
Settings is open); each code expires after five minutes and can be used once.
The manual pairing card uses the same code. Paired devices can be revoked from
the desktop app.

Remote control is intended for a trusted LAN or Tailscale. The remote page is
served over plain HTTP on the LAN; use Tailscale (which encrypts traffic) when
you need to control the player from outside the local network. Outstanding
pairing codes are kept in server memory, so restarting the server invalidates
them.

## Firefox sidebar

Firefox uses a native sidebar instead of Chrome's side panel:

- Open it from Firefox's **View → Sidebar → media-launcher**, or
- Click the sidebar button in the toolbar popup.

## Troubleshooting

**Server not found**

- Make sure the desktop app or `pnpm -C server dev` is running.
- The extension auto-discovers ports 5000–5010; check the Server URL in options.
- If the server runs on another port, enter it manually and click Detect server.

**401 Unauthorized**

- Copy the API token again from the desktop app's Settings → Connection.
- The token is per server install; a reset server generates a new one.

**Nothing happens when I click Play**

- Check that mpv and yt-dlp are installed and on `PATH`.
- Look at the desktop app's status/logs or the server terminal for the error.
- Try the toolbar popup to see the exact error message.

**No in-page button**

- The site may have changed its DOM. The popup, context menu, and shortcuts still
  work.
- Check that **On-page controls → Show the play button on video pages** is enabled.

**No notifications**

- Enable **Show desktop notifications after sending** in options.
- Check the browser's notification permission for the extension.

## Development

```bash
# Lint / format
pnpm lint
pnpm lint:fix
pnpm format

# Type checks
pnpm type-check

# Build everything the root workspace owns
pnpm build

# Individual packages
pnpm dev:desktop
pnpm dev:chrome
pnpm dev:firefox
pnpm -C server dev
```

CI runs linting, type checks, and builds for the server, desktop app, and both
extensions.

## Security

- The API binds to `127.0.0.1` by default and rejects non-loopback `Host` headers
  unless remote control is explicitly enabled for a private LAN.
- Every API route except the health probe and remote pairing page requires a
  token. Remote session tokens are hashed at rest.
- QR pairing uses one-time random codes (five-minute TTL) and the remote page
  enforces a nonce based CSP. Paired phones cannot mint new pairing codes.
- Remote control is for trusted LAN/Tailscale networks; the LAN page uses plain
  HTTP, so use Tailscale for encrypted access outside the local network.
- The extension API token is stored in local storage, not in browser sync.

## License

MIT
