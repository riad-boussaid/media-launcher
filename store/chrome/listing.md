# Chrome Web Store listing

## Store fields

| Field | Value |
|---|---|
| Name | Media Launcher |
| Short description | Send videos from YouTube, Vimeo, Twitch and more to mpv on your computer with one click. |
| Category | Entertainment |
| Language | English |
| Homepage | https://github.com/riad-boussaid/media-launcher |
| Support | https://github.com/riad-boussaid/media-launcher/issues |
| Privacy policy | https://riad-boussaid.github.io/media-launcher/privacy-policy.html |

The short description is 88 characters (limit: 132).

## Detailed description

Media Launcher sends the video you are watching to mpv on your computer — no
copying URLs and no switching tabs.

**One click, from anywhere**

- Play or queue from a video page, a thumbnail, a playlist, the toolbar popup,
  the right-click menu, or a keyboard shortcut.
- Dedicated buttons appear on YouTube (including Shorts), Vimeo, Dailymotion,
  Twitch, Bilibili, SoundCloud, Facebook, X/Twitter, Reddit, TikTok, Instagram,
  Kick, Rumble, and Odysee.
- Shift-click any in-page button to add the video to the queue instead of
  replacing what is playing.

**Your playback, your rules**

- Choose maximum resolution, codec, audio-only mode, subtitle language, volume,
  speed, and loop.
- Add extra mpv arguments for advanced setups.
- Videos resume where you left off, with a local watch history.
- Save videos to Watch Later from the on-page and thumbnail Save buttons, the
  popup, the right-click menu, or Alt+Shift+S; the list is shared with the
  desktop app and phone remote.

**Control from your phone**

- Enable remote control to get a QR code and a one-time pairing code.
- A paired phone can seek, pause, skip, change chapters, adjust volume and
  speed, browse recent history and Watch Later, and play saved videos.
- Remote access works over your LAN or Tailscale; paired devices can be revoked
  at any time.

**Private by design**

- No analytics, telemetry, advertising, or tracking.
- The extension talks to the Media Launcher app running on your own computer.
- The API token stays in local extension storage and is never synced.

**Requirements**

- The free Media Launcher desktop app (Windows, macOS, or Linux).
- mpv on your computer. yt-dlp is strongly recommended.

Media Launcher is open source under the MIT License.

## Screenshots (upload in this order)

1. `store/assets/screenshot-popup-1280x800.png` — play or queue the current
   page with quality controls.
2. `store/assets/screenshot-player-1280x800.png` — remote control and playback
   status.
3. `store/assets/screenshot-options-1280x800.png` — server, playback, and
   on-page control settings.

## Promotional images

- Small promo tile: `store/assets/chrome-promo-440x280.png`
- Marquee: `store/assets/chrome-marquee-1400x560.png`

## Single purpose statement

Media Launcher has one purpose: send the video in the current browser page to
the user's own media player (mpv) and control playback. Every permission and UI
surface exists to detect a playable video, send it to the local Media Launcher
server, or show playback state and history for that server.

## Permission justifications

| Permission | Why it is needed |
|---|---|
| `storage` | Save the server URL, API token (local only), playback preferences, and a cache of history and Watch Later returned by the user's server. |
| `activeTab` | Read the current tab's URL and title when the user opens the popup or invokes a shortcut, so the correct video can be sent. |
| `contextMenus` | Add Play, Queue, and Save to Watch Later actions when the user right-clicks a page, link, or video. |
| `notifications` | Show a success or failure notification after a play, queue, or save request, with the video thumbnail when available. |
| `alarms` | Periodically refresh the toolbar badge that indicates whether the local Media Launcher server is reachable. |
| `sidePanel` | Host the extension's side-panel UI (Chrome 116+). |
| Content script on `<all_urls>` | Detect supported video pages and inject the play and Save to Watch Later buttons or thumbnail chip. The script reads video elements, video links, thumbnail images, and page metadata, and requests the local Watch Later list to show saved states. Page information is sent to the user's local server only when the user acts. |
| `http://localhost:*/*`, `http://127.0.0.1:*/*` | Reach the Media Launcher API on the user's own machine. Ports 5000–5010 are probed during discovery. |

### Host permissions for thumbnails and site metadata

| Host | Purpose |
|---|---|
| `https://img.youtube.com/*` | YouTube video thumbnails in the popup, notifications, history, and Watch Later. |
| `https://*.youtube.com/*` | Detect videos, Shorts, and playlists on YouTube pages. |
| `https://i.vimeocdn.com/*` | Vimeo thumbnails. |
| `https://*.dailymotion.com/*` | Dailymotion page metadata. |
| `https://images.dmcdn.net/*` | Dailymotion thumbnails. |
| `https://static-cdn.jtvnw.net/*` | Twitch thumbnails. |
| `https://i0.hdslb.com/*` | Bilibili thumbnails. |
| `https://i1.sndcdn.com/*` | SoundCloud artwork. |
| `https://pbs.twimg.com/*` | X/Twitter thumbnails. |
| `https://i.redd.it/*`, `https://preview.redd.it/*` | Reddit thumbnails. |
| `https://raven.rumble.com/*` | Rumble thumbnails. |
| `https://thumbnail.odycdn.com/*` | Odysee thumbnails. |

Thumbnail hosts are used only to display artwork for videos the user explicitly
sends or views in history. Requests go directly from the browser to the image
host.

## Data usage

The developer does not collect or receive any user data. Video URLs, titles,
playback options, and the API token are sent only to the Media Launcher server
the user configures, which runs on the user's own computer or network by
default. There are no analytics, ads, tracking pixels, or remote code.

See `store/chrome/privacy-practices.md` for the privacy practices form answers.

## Remote code

The extension does not execute remote code. All JavaScript ships inside the
extension package. The optional SponsorBlock integration is an mpv Lua script
downloaded by the desktop app, not by the extension.
