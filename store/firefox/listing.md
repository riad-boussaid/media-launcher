# Firefox addons.mozilla.org listing

## Store fields

| Field | Value |
|---|---|
| Name | Media Launcher |
| Summary | Send videos from YouTube, Vimeo, Twitch and more to mpv on your computer. |
| Category | Entertainment |
| Tags | video, mpv, youtube, media player, remote control |
| License | MIT |
| Homepage | https://github.com/riad-boussaid/media-launcher |
| Support | https://github.com/riad-boussaid/media-launcher/issues |
| Privacy policy | https://riad-boussaid.github.io/media-launcher/privacy-policy.html |
| Add-on ID | `media-launcher@riad-boussaid` |
| Minimum Firefox | 142.0 |

## Description

Media Launcher sends the video you are watching to mpv on your computer — no
copying URLs and no switching tabs.

**One click, from anywhere**

- Play or queue from a video page, a thumbnail, a playlist, the toolbar popup,
  the right-click menu, or a keyboard shortcut.
- Buttons appear on YouTube (including Shorts), Vimeo, Dailymotion, Twitch,
  Bilibili, SoundCloud, Facebook, X/Twitter, Reddit, TikTok, Instagram, Kick,
  Rumble, and Odysee.
- Shift-click any in-page button to add the video to the queue.

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
  speed, browse recent history and Watch Later, and play saved videos over your
  LAN or Tailscale.
- Paired devices can be revoked at any time.

**Private by design**

- No analytics, telemetry, advertising, or tracking.
- The extension talks to the Media Launcher app on your own computer.
- The API token stays in local extension storage and is never synced.

**Requirements**

- The free Media Launcher desktop app (Windows, macOS, or Linux).
- mpv on your computer. yt-dlp is strongly recommended.

The Firefox build uses a native sidebar instead of Chrome's side panel. Open it
from **View → Sidebar → Media Launcher** or from the toolbar popup.

Media Launcher is open source under the MIT License.

## Screenshots

1. `store/assets/firefox-screenshot-1280x800.png` — play, queue, and quality
   controls.

## Icon

- `store/assets/icon-128.png` (128×128, also used in the manifest)
- `store/assets/icon-512.png` (512×512, for the listing page)

## Data collection declaration

The manifest declares:

```json
"browser_specific_settings": {
  "gecko": {
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```

The developer collects no data. Video URLs, titles, playback options, and the
API token are sent only to the Media Launcher server on the user's own device or
network. See `store/firefox/permissions.md` for the permission rationale and
`store/firefox/reviewer-notes.md` for testing steps.
