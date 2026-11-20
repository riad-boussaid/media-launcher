# media-launcher

[![CI](https://github.com/riad-boussaid/media-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/riad-boussaid/media-launcher/actions/workflows/ci.yml)

Send videos from your browser to an external media player (mpv) with one click.

[Website](https://media-launcher.pages.dev/) ·
[Install guide](docs/installing.md) ·
[Privacy](docs/privacy-policy.md)

## Features

- **One-click playback** from video pages, thumbnails, playlists, and YouTube Shorts.
- **Queue instead of replace**: Shift-click an in-page button, use the
  Queue context-menu items, or press a keyboard shortcut.
- **Queue titles**: queued videos show their resolved title before they start,
  instead of a bare hostname.
- **Queue management**: drag to reorder, shuffle, and choose repeat-one/repeat-all
  from the desktop player; jump, remove, or clear queued videos from the desktop
  or the phone remote; add new URLs with Queue; queue any item from History or
  the Play page's recent chips while a video is playing. Queueing requires an
  active player, and the queue is snapshotted so it can be restored after
  restarting the app or server.
- **Playlists**: play or queue an entire YouTube/Vimeo playlist. Tracks are
  resolved up front, grouped in Up Next by playlist, and keep their titles and
  thumbnails. Private/deleted entries are skipped automatically. Played tracks
  are collapsed by default; each group can show or clear them, be removed from
  the queue, or be replayed. Truncated playlists say how many tracks are shown
  and offer **Load more**, which inserts the next page next to its group.
- **Playback failures**: when a queued or playlist track cannot be played, the
  desktop and remote pages name the failed track instead of silently skipping
  it, with Dismiss and (when it is still queued) Retry actions.
- **Per-page controls**: choose resolution, codec, audio-only mode, subtitles,
  volume, speed, loop, and extra mpv arguments.
- **History and resume**: watch history is stored by the local server and
  partially watched videos resume where they left off, including queued and
  playlist tracks when they load. History rows are keyboard-accessible and
  reveal their actions on focus.
- **Watch Later**: save videos from the in-page or thumbnail Save buttons, the
  popup or sidebar, the right-click menu, or Alt+Shift+S. Saved videos stay
  until you remove them; the server-backed list is shared by the desktop Later
  tab and the phone remote, where each item shows watched/resume status and can
  be played, queued, or removed. The desktop tab can play or queue the whole
  list, multi-select a subset, bulk-remove, filter to in-progress videos, sort
  or drag to reorder the list, import/export full JSON backups, refresh an
  item's metadata, and mark videos unwatched, and the Now Playing card can save
  or remove the current track. Watched videos are grouped into a collapsible
  section. Progress bars appear in History, Watch Later, and the extension popup
  once a video's duration is known, and the Continue filter is remembered on
  desktop and the remote. Share, embed, and tracking-parameter variants of the
  same video collapse to one bookmark.
- **Live streams**: live and upcoming broadcasts are detected from metadata and
  badged in History, Watch Later, the popup, and the remote. They never record a
  resume position or a "watched" state; finished broadcasts show **Was live** but
  behave like normal videos.
- **Shorts & Reels**: YouTube Shorts, Facebook Reels, and Instagram Reels are
  detected from their URLs or vertical, short metadata. They show a SHORT/REEL
  badge in History, Watch Later, the popup, queue rows, and the remote; the
  desktop Later and History tabs can hide them with a persisted **Hide Shorts &
  Reels** filter, and the remote Watch Later card has its own toggle.
- **Remote control from a phone**: LAN or Tailscale, with player status,
  seek/pause/skip, chapters, volume, mute, speed, repeat, artwork, recent-history
  thumbnails, a Watch Later list, full grouped queue management (move, remove,
  shuffle, repeat, clear, load more), played-track replay, playback errors,
  reconnect feedback, PWA metadata/icons, and a best-effort screen wake lock.
- **SponsorBlock**: optional mpv Lua script, installed from the desktop app's
  Downloads section.
- **Injected-UI controls**: turn the page and thumbnail Save buttons, the page
  and thumbnail play buttons, and native notifications on or off from the
  extension settings.
- **Guided setup**: a first-run card detects missing mpv, yt-dlp, and ffmpeg,
  installs portable copies on Windows, and shows copyable package-manager
  commands elsewhere.
- **App updates**: the desktop app checks GitHub Releases at startup and every
  12 hours, shows the current/latest version in Settings → About, and surfaces
  an update action in the tray and Settings with release notes and a download
  link.
- **Tool manager**: Settings groups the playback engine, extras, and other
  players; shows versions, portable/system source, size, and which copy is in
  use; and supports importing existing binaries, opening/revealing the tools
  folder, cancelling downloads, update checks, removal confirmation, rechecking
  external installs, and optional automatic yt-dlp updates. Downloaded portable
  copies are marked as checksum-verified, and manually imported copies are
  labelled separately.
- **Safety first**: the API binds to loopback by default, requires a token, and
  remote pairing uses short-lived codes rather than the master token.

## Supported sites

YouTube (including Shorts), Vimeo, Dailymotion, Twitch, Bilibili, SoundCloud,
Facebook, X/Twitter, Reddit, TikTok, Instagram, Kick, Rumble, and Odysee.

In-page buttons are injected where the site exposes stable player markup.
Thumbnail play chips appear on video cards. Every site remains usable through
the toolbar popup, the right-click menu, and keyboard shortcuts.

## Install

Everything can be installed for free. The Chrome Web Store registration and
Apple notarization are optional paid conveniences; see
[docs/installing.md](docs/installing.md) for the free paths and the warnings
that unsigned builds show.

### Desktop app

Download the latest installer from
[GitHub Releases](https://github.com/riad-boussaid/media-launcher/releases/latest):

- **Windows** — `Media-Launcher-<version>-win-x64.exe`
- **macOS** — `Media-Launcher-<version>-mac-x64.dmg` or `...-mac-arm64.dmg`
- **Linux** — `Media-Launcher-<version>-linux-x86_64.AppImage` or `Media-Launcher-<version>-linux-amd64.deb`

The desktop app bundles and starts the API server. On first launch it checks
for mpv, yt-dlp, and ffmpeg and shows a setup card when something is missing:

- **Windows** — install portable copies with one click; no admin rights needed.
- **macOS / Linux** — download yt-dlp in the app and install mpv/ffmpeg with
  your package manager (the card shows the command to copy):

```bash
# macOS (Homebrew)
brew install mpv ffmpeg

# Debian/Ubuntu
sudo apt install mpv ffmpeg
```

Already have them elsewhere? Point the app at a custom player in Settings or
put the binaries on `PATH`; the setup card has a **Recheck** action. Portable
yt-dlp copies are updated automatically at startup and every 12 hours; this can
be disabled in **Settings → Downloads**.

Releases are unsigned unless Apple/Windows signing credentials were configured.
Windows SmartScreen and macOS Gatekeeper warnings are expected; the exact
bypass and verification steps are in
[docs/installing.md](docs/installing.md#windows-desktop) and
[docs/installing.md](docs/installing.md#macos-desktop).

### Browser extension

Release artifacts are attached to every GitHub release.

**Chrome, Edge, Brave** — no store required:

1. Download `media-launcher-chrome-<version>.zip`.
2. Unzip it into a permanent folder.
3. Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
4. Enable **Developer mode**, click **Load unpacked**, and select the folder
   containing `manifest.json`.

**Firefox** — install from
[addons.mozilla.org](https://addons.mozilla.org/firefox/addon/media-launcher/).
AMO signs the extension and updates it automatically. For a build newer than
the store listing, download the release XPI and load it temporarily through
`about:debugging#/runtime/this-firefox`.

Manual update and troubleshooting steps are in
[docs/installing.md](docs/installing.md#chrome-edge-and-brave-manual-install).
Both extensions need the desktop app or a standalone server running locally.

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
- **Playlists**: playing a YouTube or Vimeo playlist resolves its tracks and
  replaces the queue with them; shift-click to append the playlist instead.
  Up Next groups the tracks under the playlist name, with controls to jump,
  replay played tracks, clear played tracks, remove the rest of the playlist,
  or load the next page of a long playlist. Private and deleted videos are
  filtered out during resolution. Queueing needs an active player.
- **Queue**: Shift-click any in-page play button (or the playlist badge) to add
  the video or playlist to mpv's queue instead of replacing the current video.
  When you queue a playlist, the extension notification reports how many videos
  were added.

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
- **On-page controls** — show/hide the page and thumbnail buttons (play and Save
  to Watch Later), plus desktop notifications.
- **Appearance** — light/dark/system theme.

## Remote control

1. In the desktop app open **Settings → Remote control** and enable it.
2. Scan the QR code with a phone on the same LAN (or over Tailscale).
3. The phone can seek, pause, skip, change chapters, volume, mute, speed, play
   recent history, review and replay played playlist tracks, move items in the
   queue, shuffle, choose repeat modes, clear the queue, load more playlist
   pages, and dismiss or retry playback errors. Artwork and recent thumbnails
   are proxied through the local server. On HTTPS/localhost, the page also
   registers a lightweight service worker, exposes PWA metadata/icons for
   installable mode, and requests a screen wake lock while visible.

QR codes contain a one-time pairing code, not the API token. The desktop mints
a fresh code from the local server when the displayed codes are about to
expire; each code expires after five minutes and can be used once. The manual
pairing card uses the same code. Paired devices can be revoked from the desktop
app.

Remote control is intended for a trusted LAN or Tailscale. The remote page is
served over plain HTTP on the LAN; use Tailscale (which encrypts traffic) when
you need to control the player from outside the local network. Outstanding
pairing codes are kept in server memory, so restarting the server invalidates
them. Consumed codes cannot be replayed after a restart either — they are
discarded with the rest of the in-memory state.

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

# Marketing site (Astro)
pnpm dev:site
pnpm build:site
pnpm check:site
pnpm deploy:site            # build + Wrangler Pages deploy

# Release checks and browser bundles
pnpm version:check
pnpm icons:check
pnpm check:release
pnpm release:extensions     # -> artifacts/*.zip and *.xpi

# Desktop installers
pnpm -C desktop run dist:win
pnpm -C desktop run dist:mac
pnpm -C desktop run dist:linux
```

CI runs linting, type checks, and builds for the server, desktop app, both
extensions, and the Astro marketing site, then packages the Chrome ZIP and
Firefox XPI. Tagging `v*` runs the full release workflow, including desktop
installers for Windows, macOS, and Linux. See
[docs/releasing.md](docs/releasing.md) for versioning, signing secrets, and
store submission, and [site/README.md](site/README.md) for the Cloudflare Pages
setup.

## Privacy

Media Launcher has no analytics, telemetry, advertising, or developer-operated
backend. The extension sends video URLs and your API token only to the local
server you configure. The token stays in local extension storage, is never
synced, and is excluded from settings exports.

See [docs/privacy-policy.md](docs/privacy-policy.md) for the full policy.

## Security

- The API binds to `127.0.0.1` by default and rejects non-loopback `Host` headers
  unless remote control is explicitly enabled for a private LAN.
- Every API route except the health probe and remote pairing page requires a
  token. Remote session tokens are hashed at rest.
- QR pairing uses one-time random codes (five-minute TTL) and the remote page
  enforces a nonce based CSP. Paired phones cannot mint new pairing codes.
- Remote control is for trusted LAN/Tailscale networks; the LAN page uses plain
  HTTP, so use Tailscale for encrypted access outside the local network.
- The extension API token is stored in local storage, not in browser sync, and
  is not written to settings export files.
- Release checksums and build-provenance attestations are published with every
  GitHub release.

## License

MIT
