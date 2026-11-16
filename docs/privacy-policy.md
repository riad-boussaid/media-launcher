# Media Launcher Privacy Policy

**Effective date:** 2026-11-16

Media Launcher is an open-source browser extension and desktop app that sends
videos from your browser to a media player (mpv) running on your own computer.
This policy explains what data the extension and desktop app handle, where it
goes, and how to delete it.

## Summary

- **No analytics, telemetry, advertising, or tracking.** The developer does not
  operate a server that receives your data.
- **No account is required.** Media Launcher does not ask for your name, email,
  or any personal profile.
- **Your data stays on your device or your own network.** The extension talks to
  the Media Launcher server running on your computer (by default
  `localhost:5000`), not to a developer-operated service.
- **You control history and remote access.** History can be cleared from the
  extension or desktop app, and paired remote devices can be revoked.

## Who this policy covers

This policy covers:

- the Media Launcher browser extension for Chrome, Edge, Brave, and Firefox;
- the Media Launcher desktop app for Windows, macOS, and Linux;
- the local API server embedded in the desktop app (or run separately from the
  `server/` directory).

The Media Launcher source code is published at
<https://github.com/riad-boussaid/media-launcher>. The developer can be reached
through the repository's issue tracker.

## Data handled by the browser extension

### Stored locally on your device

- **API token** — the token that authenticates the extension to your own Media
  Launcher server. It is stored in the browser's local extension storage, not
  in browser sync storage, and is not sent anywhere except the server URL you
  configure.
- **History cache** — a local copy of the most recent entries returned by your
  server: page URL, title, thumbnail URL, timestamp, and resume position.
- **Interface state** — theme choice and whether history sections are expanded.

### Stored in browser sync storage

Non-secret preferences may be synchronized by your browser vendor to the account
signed into the browser:

- server URL;
- maximum resolution, codec, subtitle language, volume, speed, loop, and
  audio-only/thumbnail settings;
- extra mpv arguments (free text);
- on-page control and notification toggles.

The API token is deliberately excluded from sync storage. If you use a browser
profile with sync enabled, these preferences may be stored on the browser
vendor's servers under that vendor's privacy policy. You can disable browser
sync or avoid using sync storage at any time.

### Page information

The extension injects a content script into pages so it can detect supported
video pages, video thumbnails, and player controls. The script inspects:

- the page URL and hostname;
- video elements and video-related links;
- page images used as thumbnails;
- Open Graph/Twitter thumbnail metadata.

This information is not transmitted until you explicitly play or queue a video,
open the popup, or use a context-menu/shortcut action. The extension does not
read passwords, form fields, cookies, keystrokes, or arbitrary page text.

### Data sent to your Media Launcher server

When you play or queue a video, the extension sends the following to the server
URL configured in its options (default `http://localhost:5000`):

- the video or page URL and optional title;
- playback options derived from your settings;
- whether the action is play or queue;
- your API token in the `Authorization` header.

History requests, settings requests, and server health checks include the API
token (except the unauthenticated health probe). If you change the server URL to
a machine you control, that machine receives this data instead. The developer
does not receive it.

### Thumbnails and third-party requests

To show thumbnails in the popup, history, notifications, and in-page controls,
the extension loads images from:

- `img.youtube.com` for YouTube thumbnails;
- thumbnail hosts declared in the extension manifest, such as Vimeo, Twitch,
  Dailymotion, Bilibili, SoundCloud, X/Twitter, Reddit, Rumble, and Odysee CDNs;
- thumbnail URLs provided by the page itself, subject to the declared host
  permissions.

Those requests go directly from your browser to the image host and are governed
by that host's privacy policy. The extension does not proxy them through the
developer.

### Settings export

The extension can export your preferences and server URL to a JSON file you
choose to save. **The API token is excluded from exports.** Importing a settings
file can still accept a token for backward compatibility, but the extension does
not write tokens into exported files.

## Data handled by the desktop app and local server

### Stored on your computer

The desktop app stores the following under the operating system's per-user data
directory:

- **SQLite database** — playback history (URL, title, thumbnail URL, timestamp,
  resume position), app settings, and hashed remote-session records.
- **API token file** — the master token used to authenticate the extension. The
  server requests owner-only permissions where the operating system supports
  them.
- **Logs** — server output, which can include the player command line and the
  URL being played.
- **Downloads** — tools you explicitly download through the app (for example
  yt-dlp) and any SponsorBlock script you install.

The desktop app does not include analytics, telemetry, crash reporting, or
advertising SDKs.

### Network activity

The server binds to `127.0.0.1` by default. When you enable remote control, it
listens on your local network (or a Tailscale interface) so a paired phone can
control playback.

When you play a video, the server runs mpv and/or yt-dlp, which contact the
video site and its media CDNs to stream the video and fetch metadata. If you
install SponsorBlock, its mpv script contacts the SponsorBlock API to look up
sponsor segments. Downloads of yt-dlp or other tools come from their upstream
GitHub releases. These requests are governed by those services' policies.

## Remote control

Remote control is intended for a trusted LAN or Tailscale network.

- Pairing uses single-use random codes with a five-minute lifetime. Codes are
  kept in server memory and are lost when the server restarts.
- A paired phone receives a revocable session token, stored in the phone
  browser's `localStorage`.
- The remote page can display recent history titles and URLs and can control
  playback. Paired devices can be revoked from the desktop app.
- The remote page is served over plain HTTP on the LAN. Use Tailscale when you
  need encrypted transport outside your local network.

## What the developer does not do

- Does not receive, collect, sell, rent, or share your browsing history, video
  URLs, or API token.
- Does not use analytics, tracking pixels, advertising, or fingerprinting.
- Does not load remote code into the extension.
- Does not require an account or collect personal information.

## Data retention and deletion

- **Extension history:** clear it from the popup or history view, or remove the
  extension. Cached history is also replaced as new entries arrive.
- **Extension settings:** reset them in the options page, or remove the
  extension. Synced preferences may remain in your browser account until you
  delete them through the browser's sync settings.
- **Desktop history:** clear it in the app, or delete the server data directory
  (shown in the app's settings/log paths) after quitting the app.
- **Logs:** delete `server.log` from the app's logs directory.
- **Remote devices:** revoke individual sessions or all sessions from the
  desktop app. Restarting the server invalidates outstanding pairing codes.
- **Downloads:** delete downloaded tools from the app's Downloads section.

## Security

Media Launcher is designed to keep control local:

- The API binds to loopback by default and rejects non-loopback `Host` headers
  unless remote control is explicitly enabled for a private network.
- Every API route except the health probe and the pairing page requires a token.
- Remote session tokens are hashed at rest.
- The extension stores the master token in local storage, not browser sync.
- The remote page uses a nonce-based Content Security Policy.
- QR pairing uses single-use, expiring codes.

No system is perfectly secure. Protect your API token, use a trusted network for
remote control, and revoke devices you no longer use.

## Children

Media Launcher is not directed at children and does not knowingly collect
personal information from anyone.

## Changes to this policy

This policy may be updated when the extension or desktop app changes. The
effective date at the top will change, and material updates will be noted in the
project changelog or release notes.

## Contact

Questions or requests about this policy can be raised at
<https://github.com/riad-boussaid/media-launcher/issues>.

## License

Media Launcher is open source under the MIT License. See `LICENSE` in the
repository.
