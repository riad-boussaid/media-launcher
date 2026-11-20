# Changelog

All notable changes to Media Launcher are documented here. This project
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Watch Later: save the current page from the extension popup or sidebar, the
  right-click menu, or Alt+Shift+S. The server-backed list is shared by the
  desktop Later tab and the phone remote, with play, queue, and remove actions
  for each saved video.
- Watch Later recognizes the same video across share, embed, Shorts, and
  tracking-parameter URL forms, and merges duplicate bookmarks on startup.
- History rows now use the same canonical URLs, so share-link variants of the
  same video dedupe there too and resume works across them.
- Watch Later rows show a "Watched" marker or a resume position based on
  playback history.
- The desktop Later tab can play or queue every listed video, or multi-select a
  subset to play, queue, or remove.
- History now stores video duration; History and Watch Later show progress
  bars, and Watch Later can filter to in-progress videos. The remote Watch Later
  card has the same Continue filter.
- The desktop Later tab can sort by newest, oldest, or title, or switch to a
  manual order with drag-and-drop or keyboard reordering.
- Watch Later can be exported to and imported from JSON, individual videos can
  be marked unwatched, and direct media URLs gained a "Save Media to Watch
  Later" context-menu item.
- The popup's Watch Later rows show a compact progress indicator.
- Live and upcoming streams are detected through yt-dlp metadata. They show a
  LIVE badge in History, Watch Later, the popup, and the remote, and are excluded
  from resume positions, progress bars, and watched state. Finished broadcasts
  show "Was live" but keep normal VOD behavior.
- YouTube Shorts, Facebook Reels, and Instagram Reels are detected from their
  URLs or vertical, short metadata. They show a SHORT/REEL badge across History,
  Watch Later, the popup, and the remote, and the desktop Later tab has a
  persisted "Hide Shorts & Reels" filter. Existing Reel rows are flagged on
  startup.
- Watch Later metadata can be refreshed per item, and live statuses are refreshed
  in the background on list reads and picked up by polling.
- Queue rows, remote recent rows, and the remote Watch Later card show live and
  Short/Reel labels. History has a persisted Hide Shorts & Reels filter, and the
  remote Watch Later card has a No Shorts toggle.
- Watch Later JSON backups now include live/Short flags, custom order, and
  playback progress; imports restore them into Watch Later and History.
- Watched videos are grouped into a collapsible section in the desktop Later
  tab, and the Continue filter is remembered on desktop and the remote.

### Fixed

- Extension context menus are rebuilt on install, update, and browser start, so
  stale entries no longer linger after upgrading.
- Broken remote thumbnails fall back to the placeholder once and are not retried
  for the rest of the session, so an invalid CDN certificate no longer repeats
  TLS errors in the log.

## [1.1.0] - 2026-11-18

### Added

- Show video artwork on the desktop now-playing card and thumbnails in queue
  rows, using the metadata already stored in history.
- Queue management from the desktop now-playing card: jump to a queued video,
  move it up or down, remove it, or clear the queue. The Play page can also
  queue another URL, and History rows can queue videos while a player is
  active.
- YouTube and Vimeo playlists are resolved into individual queue entries with
  titles and thumbnails. Play replaces the queue with the playlist, Queue
  appends it, and Up Next groups tracks by their source playlist.
- Played playlist tracks stay in the queue with a played marker instead of
  disappearing when you jump ahead; clicking one replays it. Played tracks are
  collapsed behind a per-playlist “Show N played” toggle by default.
- Playlist groups in Up Next can be collapsed, removed from the queue as a
  whole, or have their played tracks cleared. Truncated playlists report how
  many tracks are shown.
- Playback errors are surfaced on the desktop and remote now-playing panels
  with the failed track's playlist position and a Dismiss action, instead of
  the player silently skipping to the next track.
- The remote page shows played playlist tracks behind a toggle so they can be
  replayed, and keeps the up-next list visible when only played tracks remain.
- History rows are keyboard-accessible and reveal their actions on focus; the
  Play page's recent chips have a separate queue button.
- Extension notifications report how many videos a queued playlist added
  (“Queued 13 videos”).
- The remote page now shows the entire queue grouped by playlist, with
  tap-to-play and per-item remove buttons plus a playlist-level Remove action.
  Now-playing and recent rows show proxied artwork.
- Truncated playlists have a **Load more** action that resolves and appends the
  next 200 tracks without restarting playback.
- The queue is snapshotted to disk, so after an app or server restart the Play
  page offers **Restore** or **Discard** for the previous queue.
- Partially watched queued and playlist tracks resume from their saved position
  when they load, not just videos launched from a URL.
- Playback errors offer **Retry** when the failed track is still in the queue.
- Playlist resolution now skips private, deleted, and unavailable entries
  instead of queueing tracks that fail later.
- Upcoming queue items can be reordered by drag and drop, with **Shuffle** and
  **Repeat all / Repeat one** controls in the queue header.
- **Load more** inserts the next playlist page next to the existing playlist
  group (rather than after manual queue items), and remains available when the
  playlist’s current track is the only one left in the queue.
- The remote queue now matches desktop controls: move up/down, shuffle,
  repeat off/all/one, clear queue, and Load more for both playlist groups and
  the current-track-only case. The page requests a screen wake lock while
  visible on secure origins.
- Queue shuffle and playlist Load more now operate in place using
  `playlist-move` / `loadfile insert-at` instead of clearing and re-appending
  the upcoming queue, so playback keeps running during the operation.
- Repeat is available from the main playback controls (and the remote’s utility
  row), so repeat-one/all works even for a single video with no queue.
- Queue actions now show visible error feedback on desktop and remote when
  Load more, shuffle, move, clear, or repeat fails — including the case where
  playback ended while a playlist page was resolving.
- Playlist groups report how many tracks are actually available when private or
  deleted entries were skipped.
- The remote page includes a web app manifest and embedded PNG icons, a
  best-effort service worker on secure origins, a connection-lost indicator,
  and a wake-lock status hint.
- Desktop app update awareness: GitHub Releases are checked at startup and
  every 12 hours. Settings → About shows current/latest versions, release notes,
  last-checked time, and a platform-matched download link; the tray adds an
  “Update available” action.
- App update checks and tool downloads now use Electron’s network stack
  (`net.fetch`), so they respect system proxy and certificate configuration
  instead of failing where Node’s global fetch cannot reach GitHub.
- A first-run **Set up playback** card detects missing mpv, yt-dlp, and ffmpeg.
  Windows can install verified portable copies with one click; macOS/Linux get
  copyable package-manager commands. **Recheck** re-probes `PATH` after an
  external install.
- Settings → Downloads is now a grouped tool manager: playback engine, extras,
  and other players, with installed versions, portable/system source, disk
  usage, and an “In use” marker. Downloads can be cancelled, removals require
  confirmation, and platform-unavailable tools show install guidance instead of
  dead rows.
- yt-dlp can update itself automatically at startup and every 12 hours (on by
  default for portable copies), with a toggle and manual check/update controls
  in Downloads.
- Downloads can **import** an existing mpv/yt-dlp/ffmpeg/SponsorBlock file,
  **open the tools folder**, or reveal a specific binary in the file manager.
  Portable downloads are marked **Verified** when their checksum passed, while
  manual imports are marked **Imported** and are excluded from automatic
  updates.

### Fixed

- "Play playlist" now actually loads the whole playlist instead of relying on
  mpv's default `--no-playlist` behavior.
- Playback now exits when the last video ends instead of sitting paused on its
  final frame, so the Now Playing card clears. Queued videos still advance
  normally.
- Queued videos now show their resolved titles before playback instead of
  bare hostnames.
- The remote volume slider now renders its track and fill in Firefox.
- Collapsing a playlist group or expanding its played tracks no longer resets
  when the current track changes or the queue is edited.
- Queueing a video while nothing is playing is rejected with a clear message
  instead of launching a player and playing it.
- The remote page surfaces server errors when sending or queueing fails.
- Portable yt-dlp and ffmpeg copies are now on mpv's `PATH`, and Homebrew bins
  are added on macOS, so downloaded tools take precedence over system installs
  and mpv's ytdl hook can find them.

### Changed

- Redesigned the desktop now-playing panel with a draggable progress bar and
  chapter markers, a prominent play/pause control, and compact volume and
  speed controls.
- Rebuilt the mobile remote-control page around a full playback console:
  draggable seek bar with chapter markers, speed presets, queue overview,
  connection status, and a recent-videos list with separate play and queue actions.

## [1.0.0] - 2026-11-16

First public release.

### Added

- Desktop app for Windows, macOS, and Linux with a tray control surface,
  start-on-boot option, and an embedded API server.
- Chrome, Edge, and Brave extension, plus a Firefox extension with a native
  sidebar.
- One-click playback and queueing from video pages, YouTube Shorts, thumbnail
  cards, playlists, the toolbar popup, the context menu, and keyboard
  shortcuts.
- Per-page playback controls: maximum resolution, codec, audio-only mode,
  subtitles, volume, speed, loop, and extra mpv arguments.
- Watch history with resume positions, locally stored by the API server.
- Remote control from a phone on the LAN or Tailscale: player status,
  seek/pause/skip, chapters, volume, mute, speed, and recent history.
- One-time QR pairing codes with expiry and device revocation.
- SponsorBlock integration through mpv's Lua script, installable from the
  desktop app.
- Chapter navigation controls for videos that expose chapters.
- Download manager for yt-dlp and other portable tools, with update checks.
- Multi-size application and extension icons.

### Changed

- Revamped in-page controls with dedicated page, thumbnail, and playlist
  buttons.
- Remote pairing now batches one-time codes and refreshes codes that are close
  to expiry.
- In-page controls and notifications can be toggled from extension settings.

### Fixed

- Remote pairing codes are refreshed before they expire instead of leaving a
  stale QR code on screen.
- Queue actions preserve the current playback when adding videos.
- Dependency updates across the desktop app, server, and extensions.

### Security

- The API binds to loopback by default and rejects non-loopback `Host` headers
  unless remote control is explicitly enabled.
- Every API route except the health probe and pairing page requires a token;
  remote session tokens are hashed at rest.
- The extension stores the API token in local storage rather than browser
  sync, and settings exports omit the token.
- The remote page uses a nonce-based Content Security Policy.
- QR pairing uses single-use random codes with a five-minute TTL.

[Unreleased]: https://github.com/riad-boussaid/media-launcher/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/riad-boussaid/media-launcher/releases/tag/v1.1.0
[1.0.0]: https://github.com/riad-boussaid/media-launcher/releases/tag/v1.0.0
