# Firefox permission rationale

AMO reviewers ask for the reason behind each permission. The manifest requests:

## API permissions

| Permission | Rationale |
|---|---|
| `storage` | Save the server URL, API token (local storage only), playback preferences, and a cache of history returned by the user's server. |
| `activeTab` | Read the current tab's URL and title when the user opens the popup or presses a shortcut, so the correct video is sent. |
| `contextMenus` | Add Play and Queue items to the page, link, and media context menus. |
| `notifications` | Show a success/failure notification after a play or queue request. |
| `alarms` | Refresh the toolbar badge that indicates whether the local server is reachable. |

`sidebar_action` is not a permission; it declares Firefox's native sidebar UI.

## Content script on `<all_urls>`

The script must run on every page to detect a supported video and inject the
play button or thumbnail chip without requiring a second click. It reads only:

- the page URL and hostname;
- video elements and video-related anchors;
- images inside video anchors (thumbnails);
- Open Graph/Twitter thumbnail metadata.

It does not read passwords, form fields, cookies, keystrokes, or arbitrary page
text. Nothing is transmitted until the user explicitly plays or queues a video,
opens the popup, or uses a context-menu/shortcut action.

## Host permissions

| Host | Purpose |
|---|---|
| `http://localhost/*`, `http://127.0.0.1/*` | Talk to the Media Launcher API on the user's own machine. |
| `https://img.youtube.com/*` | YouTube thumbnails in the popup, notifications, and history. |
| `https://*.youtube.com/*` | Detect videos, Shorts, and playlists on YouTube. |
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

Thumbnail requests go directly from the browser to the image host. They are used
only to render artwork for content the user explicitly sends or sees in history.

## Data collection

No data is collected by the developer. The extension communicates with a
companion server running on the user's own computer. See
`docs/privacy-policy.md`.
