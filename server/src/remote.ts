import { remoteClientScript } from "./remote-client.js";
import { remoteStyles } from "./remote-styles.js";

// Mobile-friendly remote control served at GET /remote (token-free; the page
// itself carries no data). Pairing: the desktop Settings QR encodes
// http://<lan-ip>:<port>/remote?c=<short-lived code> — the page exchanges the
// code for a revocable session token and stores that in the phone's
// localStorage, sending it as X-Auth-Token on every API call.

export function remotePageHtml(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="dark" />
<meta name="theme-color" content="#0e1013" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="media-launcher" />
<link rel="manifest" href="/remote/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/remote/icon-192.png" />
<title>media-launcher remote</title>
<style nonce="${nonce}">
${remoteStyles()}
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <polygon points="7 4 21 12 7 20 7 4"/>
      </svg>
    </span>
    <span class="brand-name">media-launcher</span>
  </div>
  <span class="status" role="status" aria-live="polite">
    <span class="dot" id="dot"></span>
    <span id="status-text">Connecting</span>
    <span class="wake" id="wake-lock" hidden>· awake</span>
  </span>
</header>

<div id="banner" class="banner" role="status" hidden></div>

<div class="np-error" id="np-error" hidden>
  <span id="np-error-text"></span>
  <button type="button" id="np-error-retry" hidden>Retry</button>
  <button type="button" id="np-error-dismiss">Dismiss</button>
</div>

<div class="reconnect" id="reconnect" hidden>
  <span class="dot off" aria-hidden="true"></span>
  <span>Connection lost — retrying…</span>
</div>

<section class="card" id="pair" hidden>
  <div class="label">Pair this device</div>
  <input id="pair-code" type="text" placeholder="Paste the pairing code&hellip;"
    autocapitalize="off" autocorrect="off" spellcheck="false" />
  <div class="row">
    <button id="pair-btn" class="btn primary" type="button">Pair device</button>
  </div>
  <p class="hint">The code is shown in the desktop app under <strong>Settings &rarr; Remote control</strong>. Codes expire after five minutes.</p>
  <p class="hint warn" id="pair-expiry" hidden></p>
</section>

<section class="player" id="np" hidden aria-label="Now playing">
  <div class="np-head">
    <img class="np-art" id="np-art" alt="" hidden />
    <div class="np-info">
      <div class="eyebrow">
        <span class="eq" id="np-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="eyebrow-label">Now playing</span>
        <span class="source-pill" id="np-playlist" hidden>Playlist</span>
      </div>
      <h2 class="np-title" id="np-title"></h2>
      <div class="np-meta" id="np-meta"></div>
    </div>
    <button type="button" class="icon-btn stop" id="np-stop" title="Stop playback" aria-label="Stop playback">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2"/>
      </svg>
    </button>
  </div>

  <div class="seek" id="np-seek" role="slider" tabindex="0" aria-label="Playback position"
    aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00">
    <div class="seek-track">
      <div class="seek-fill" id="np-fill"></div>
      <div class="seek-ticks" id="np-ticks"></div>
      <span class="seek-knob" id="np-knob"></span>
    </div>
  </div>
  <div class="times"><span id="np-pos">0:00</span><span id="np-dur">&mdash;</span></div>

  <div class="transport">
    <button type="button" class="t-btn" id="np-rewind" title="Back 10 seconds" aria-label="Back 10 seconds">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
        stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/>
        <path d="M3 3v5h5"/>
        <text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700"
          font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor" stroke="none">10</text>
      </svg>
    </button>
    <button type="button" class="t-btn" id="np-prev" title="Previous chapter" aria-label="Previous chapter" hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </button>
    <button type="button" class="t-btn primary" id="np-toggle" aria-label="Pause">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <rect x="6.5" y="4.5" width="4" height="15" rx="1.2"/>
        <rect x="13.5" y="4.5" width="4" height="15" rx="1.2"/>
      </svg>
    </button>
    <button type="button" class="t-btn" id="np-next" title="Next chapter" aria-label="Next chapter" hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </button>
    <button type="button" class="t-btn" id="np-forward" title="Forward 10 seconds" aria-label="Forward 10 seconds">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
        stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/>
        <path d="M21 3v5h-5"/>
        <text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700"
          font-family="ui-sans-serif, system-ui, sans-serif" fill="currentColor" stroke="none">10</text>
      </svg>
    </button>
  </div>

  <div class="utils">
    <button type="button" class="icon-btn" id="np-mute" title="Mute" aria-label="Mute">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z"/>
        <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
        <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
      </svg>
    </button>
    <input id="np-volume" class="range" type="range" min="0" max="100" value="0"
      aria-label="Volume" disabled />
    <span class="pct" id="np-volume-val">0%</span>
    <span class="divider" aria-hidden="true"></span>
    <button type="button" class="chip" id="np-repeat" title="Repeat off" aria-label="Repeat off">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m17 2 4 4-4 4"/>
        <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
        <path d="m7 22-4-4 4-4"/>
        <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
      </svg>
      <span id="np-repeat-label">Off</span>
    </button>
    <div class="speed-wrap" id="np-speed-wrap">
      <button type="button" class="chip" id="np-speed-btn" title="Playback speed"
        aria-haspopup="menu" aria-expanded="false">
        <span id="np-speed">1&times;</span>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      <div class="menu" id="np-speed-menu" role="menu" aria-label="Playback speed" hidden>
        <button type="button" role="menuitemradio" data-speed="0.5" aria-checked="false">0.5&times;</button>
        <button type="button" role="menuitemradio" data-speed="0.75" aria-checked="false">0.75&times;</button>
        <button type="button" role="menuitemradio" data-speed="1" aria-checked="true">1&times;</button>
        <button type="button" role="menuitemradio" data-speed="1.25" aria-checked="false">1.25&times;</button>
        <button type="button" role="menuitemradio" data-speed="1.5" aria-checked="false">1.5&times;</button>
        <button type="button" role="menuitemradio" data-speed="2" aria-checked="false">2&times;</button>
      </div>
    </div>
  </div>

  <div class="queue" id="np-queue" hidden>
    <div class="queue-head">
      <span class="label" id="np-queue-label">Up next</span>
      <div class="queue-actions">
        <button type="button" class="link-btn" id="np-played" hidden aria-expanded="false">0 played</button>
        <button type="button" class="link-btn" id="np-skip" title="Skip to next queued video">
          Skip
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
            <polygon points="5 5 15 12 5 19"/>
            <rect x="17" y="5" width="2.5" height="14" rx="1"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="queue-tools">
      <button type="button" class="tool-btn" id="np-shuffle">Shuffle</button>
      <button type="button" class="tool-btn" id="np-clear-queue">Clear queue</button>
    </div>
    <ol class="played-list" id="np-played-list" hidden></ol>
    <ol class="queue-list" id="np-queue-list"></ol>
  </div>
</section>

<section class="idle" id="idle" hidden>
  <span class="idle-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <polygon points="7 4 21 12 7 20 7 4"/>
    </svg>
  </span>
  <div>
    <div class="idle-title">Nothing playing</div>
    <div class="idle-sub">Send a link below to start a video.</div>
  </div>
</section>

<section class="card" id="send-card" hidden>
  <div class="label">Send a video</div>
  <input id="url" type="url" inputmode="url" enterkeyhint="go"
    placeholder="Paste a video URL&hellip;" autocapitalize="off" autocorrect="off" spellcheck="false" />
  <div class="send-actions">
    <button id="play" class="btn primary" type="button">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <polygon points="7 4 21 12 7 20 7 4"/>
      </svg>
      Play now
    </button>
    <button id="queue" class="btn secondary" type="button">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      Queue
    </button>
  </div>
  <p class="hint">Paste a link from YouTube or any supported site. The desktop app does the rest.</p>
  <p class="hint" id="secure-hint" hidden>For screen wake lock and installable mode, open this page over HTTPS (for example through Tailscale).</p>
</section>

<section class="card" id="recent-card" hidden>
  <div class="card-head">
    <span class="label">Recent</span>
    <span class="count" id="recent-count"></span>
  </div>
  <ul id="recent"></ul>
</section>

<div id="unpair-row" hidden>
  <button id="unpair" type="button">Unpair this device</button>
</div>

<script nonce="${nonce}">
${remoteClientScript()}
</script>
</body>
</html>`;
}
