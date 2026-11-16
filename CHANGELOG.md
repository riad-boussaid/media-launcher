# Changelog

All notable changes to Media Launcher are documented here. This project
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/riad-boussaid/media-launcher/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/riad-boussaid/media-launcher/releases/tag/v1.0.0
