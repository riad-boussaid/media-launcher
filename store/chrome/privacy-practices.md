# Chrome Web Store privacy practices answers

Use these answers on the **Privacy practices** tab. They match the behavior of
the extension and the local Media Launcher server.

## Single purpose

Send the video in the current browser page to the user's own media player
(mpv), queue videos, and show playback status/history for that local server.

## Data collection

- **Does the extension collect user data?** No. The developer does not receive
  any data and operates no collection endpoint.
- **Personally identifiable information:** not collected.
- **Health information:** not collected.
- **Financial and payment information:** not collected.
- **Authentication information:** not collected by the developer. The extension
  stores the user's own API token locally and sends it only to the server URL
  the user configures.
- **Personal communications:** not collected.
- **Location:** not collected.
- **Web history:** not collected by the developer. The current page URL is sent
  to the user's local server only when the user plays or queues a video.
- **User activity:** not collected by the developer.
- **Website content:** not collected by the developer. The content script reads
  video elements, video links, thumbnails, and page metadata locally to detect
  playable media, and transmits a URL/title only after a user action.

The Chrome Web Store's definition of "collect" means transmitting data off the
user's device to a server. Media Launcher's default server runs on the user's
own machine (`localhost`); no data goes to the developer.

## Data use certifications

- Data is not sold to third parties.
- Data is not used for purposes unrelated to the extension's single purpose.
- Data is not used to determine creditworthiness or for lending purposes.

## Privacy policy URL

`https://riad-boussaid.github.io/media-launcher/privacy-policy.html`

## Justification for broad host access

The content script must run on all URLs so it can detect a playable video on any
supported site and inject the play button or thumbnail chip without requiring a
second click. It does not read form fields, passwords, cookies, keystrokes, or
arbitrary page text, and it does not transmit page information until the user
plays or queues a video.

## Remote code

No remote code is executed. All extension JavaScript is bundled in the package.
