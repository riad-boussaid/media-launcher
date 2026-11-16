// Mobile-friendly remote control served at GET /remote (token-free; the page
// itself carries no data). Pairing: the desktop Settings QR encodes
// http://<lan-ip>:<port>/remote?t=<token> — the page stores the token in the
// phone's localStorage and sends it as X-Auth-Token on every API call.

export function remotePageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="dark" />
<title>media-launcher remote</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0e1013; color: #e7eaef;
    font: 14px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom));
    max-width: 480px; margin-inline: auto;
  }
  header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  .dot { width: 8px; height: 8px; border-radius: 99px; background: #34d399; box-shadow: 0 0 6px rgb(52 211 153 / 0.7); }
  .dot.off { background: #f87171; box-shadow: 0 0 6px rgb(248 113 113 / 0.7); }
  .card { background: #191d24; border: 1px solid rgb(255 255 255 / 0.08); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa3b2; font-weight: 600; margin-bottom: 8px; }
  input {
    width: 100%; padding: 11px 12px; background: #14171c; color: #e7eaef;
    border: 1px solid rgb(255 255 255 / 0.08); border-radius: 8px;
    font-size: 14px; outline: none;
  }
  input:focus { border-color: rgb(100 255 218 / 0.5); }
  .row { display: flex; gap: 8px; margin-top: 10px; }
  button {
    flex: 1; padding: 10px; border: none; border-radius: 8px;
    background: #64ffda; color: #0b0d10; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: transparent; border: 1px solid rgb(255 255 255 / 0.16); color: #b8bfca; font-weight: 500; }
  button:disabled { opacity: 0.4; }
  .np-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .np-sub { font-size: 11px; color: #8b929e; margin-top: 2px; }
  .track { height: 4px; border-radius: 99px; background: rgb(255 255 255 / 0.07); margin-top: 10px; overflow: hidden; }
  .fill { height: 100%; border-radius: 99px; background: #64ffda; width: 0%; transition: width 0.3s; }
  .times { display: flex; justify-content: space-between; font-size: 10px; color: #8b929e; margin-top: 4px; }
  ul { margin: 0; padding: 0; list-style: none; }
  ul button {
    display: flex; width: 100%; text-align: left; background: transparent;
    border: none; border-radius: 8px; padding: 10px; color: #e7eaef;
    font-size: 13px; font-weight: 400;
  }
  ul button:active { background: rgb(255 255 255 / 0.06); }
  ul .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  #np-prev, #np-next { flex: 0 0 auto; width: 46px; padding: 10px 0; }
  #np-prev svg, #np-next svg { display: block; margin: 0 auto; }
  #unpair-row { margin-top: 4px; }
  #unpair {
    flex: none; display: block; width: 100%;
    background: transparent; border: 1px solid rgb(248 113 113 / 0.3);
    color: #f87171; font-size: 12px; font-weight: 500;
  }
  #unpair:disabled { opacity: 0.4; }
  .banner {
    background: rgb(248 113 113 / 0.1); border: 1px solid rgb(248 113 113 / 0.4);
    color: #f87171; border-radius: 8px; padding: 10px; font-size: 12px;
    margin-bottom: 14px;
  }
  .banner.ok { background: rgb(52 211 153 / 0.1); border-color: rgb(52 211 153 / 0.4); color: #34d399; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<header>
  <h1>media-launcher</h1>
  <span id="dot" class="dot"></span>
</header>

<div id="banner" class="banner" hidden></div>

<div class="card">
  <div class="label">Send a video</div>
  <input id="url" type="url" inputmode="url" placeholder="Paste a video URL&hellip;"
    autocapitalize="off" autocorrect="off" spellcheck="false" />
  <div class="row">
    <button id="play">&#9654; Play</button>
    <button id="queue" class="secondary">+ Queue</button>
  </div>
</div>

<div class="card" id="np" hidden>
  <div class="label">Now playing</div>
  <div class="np-title" id="np-title"></div>
  <div class="np-sub" id="np-pos"></div>
  <div class="track" id="np-track"><div class="fill" id="np-fill"></div></div>
  <div class="np-sub" id="np-chapter" hidden></div>
  <div class="row">
    <button id="np-rewind" class="secondary" title="Back 10 seconds" aria-label="Back 10 seconds">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
        <polygon points="11 19 2 12 11 5 11 19"/>
        <polygon points="22 19 13 12 22 5 22 19"/>
      </svg>
    </button>
    <button id="np-prev" class="secondary" hidden>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </button>
    <button id="np-toggle" class="secondary">Pause</button>
    <button id="np-skip" class="secondary" hidden>Skip</button>
    <button id="np-next" class="secondary" hidden>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </button>
    <button id="np-forward" class="secondary" title="Forward 10 seconds" aria-label="Forward 10 seconds">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
        <polygon points="13 19 22 12 13 5 13 19"/>
        <polygon points="2 19 11 12 2 5 2 19"/>
      </svg>
    </button>
  </div>
  <div class="row">
    <button id="np-mute" class="secondary" title="Mute" aria-label="Mute" hidden>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z"/>
        <path d="m22 9-6 6"/>
        <path d="m16 9 6 6"/>
      </svg>
    </button>
    <input id="np-volume" type="range" min="0" max="100" value="0"
      style="flex:1;accent-color:#64ffda" aria-label="Volume" disabled />
  </div>
  <div class="row">
    <button id="np-slower" class="secondary" title="Slower" aria-label="Slower">&minus;</button>
    <span id="np-speed" class="np-sub" style="min-width:52px;text-align:center">1.00&times;</span>
    <button id="np-faster" class="secondary" title="Faster" aria-label="Faster">+</button>
    <button id="np-stop" class="secondary" title="Stop playback" aria-label="Stop playback"
      style="margin-left:8px">Stop</button>
  </div>
</div>

<div class="card" id="pair" hidden>
  <div class="label">Pair this device</div>
  <input id="pair-token" placeholder="Paste the access token&hellip;" autocapitalize="off" autocorrect="off" spellcheck="false" />
  <div class="row">
    <button id="pair-btn">Pair</button>
  </div>
  <div class="np-sub">The token is shown in the desktop app under Settings &rarr; Connection.</div>
</div>

<div class="card">
  <div class="label">Recent</div>
  <ul id="recent"></ul>
</div>

<div id="unpair-row" hidden>
  <button id="unpair" class="secondary">Unpair this device</button>
</div>

<script>
  var token = "";
  function deviceLabel() {
    var ua = navigator.userAgent;
    var os = /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad/i.test(ua)
        ? "iOS"
        : "Desktop";
    var browser = /Firefox/i.test(ua)
      ? "Firefox"
      : /Edg//i.test(ua)
        ? "Edge"
        : /Chrome/i.test(ua)
          ? "Chrome"
          : "Browser";
    return os + " \u00b7 " + browser;
  }

  try {
    var t = new URLSearchParams(location.search).get("t");
    if (t) {
      // QR pairing: exchange the master token for a revocable session token
      // so the device shows up in the desktop's Paired devices list.
      history.replaceState(null, "", location.pathname);
      fetch("/remote/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t, device: deviceLabel() }),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) { return { ok: res.ok, data: data }; });
        })
        .then(function (r) {
          // Fall back to the master token if pairing couldn't complete.
          token = r.ok && r.data.session ? r.data.session : t;
          try {
            localStorage.setItem("ml-remote-token", token);
          } catch (e) {}
          refreshUnpairRow();
          loadRecent();
          loadPlayer();
        })
        .catch(function () {
          token = t;
          try {
            localStorage.setItem("ml-remote-token", t);
          } catch (e) {}
          loadRecent();
          loadPlayer();
        });
    } else {
      token = localStorage.getItem("ml-remote-token") || "";
    }
  } catch (e) {}

  var banner = document.getElementById("banner");
  var bannerTimer = null;
  function showBanner(text, ok) {
    banner.textContent = text;
    banner.className = "banner" + (ok ? " ok" : "");
    banner.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.hidden = true; }, ok ? 2000 : 6000);
  }

  var unauthorizedShown = false;
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "X-Auth-Token": token }, opts.headers || {});
    if (opts.body) opts.headers["Content-Type"] = "application/json";
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        // Show once per unauthorized state — the 3s polling must not
        // overwrite more specific messages (e.g. pair/rate-limit errors).
        if (!unauthorizedShown) {
          unauthorizedShown = true;
          showBanner("Unauthorized — pair this device below.", false);
          document.getElementById("pair").hidden = false;
        }
        throw new Error("unauthorized");
      }
      unauthorizedShown = false;
      document.getElementById("pair").hidden = true;
      return res.json();
    });
  }

  function isHttp(u) { return /^https?:\\/\\//i.test(u); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }

  var playBtn = document.getElementById("play");
  var queueBtn = document.getElementById("queue");
  var urlInput = document.getElementById("url");

  function send(url, queue) {
    if (!isHttp(url)) {
      showBanner("Enter a valid http(s) URL", false);
      return;
    }
    playBtn.disabled = true;
    queueBtn.disabled = true;
    api("/", { method: "POST", body: JSON.stringify({ url: url, queue: !!queue }) })
      .then(function () {
        showBanner(queue ? "Added to queue" : "Sent to player", true);
        urlInput.value = "";
        loadRecent();
        loadPlayer();
      })
      .catch(function () {})
      .finally(function () {
        playBtn.disabled = false;
        queueBtn.disabled = false;
      });
  }

  playBtn.addEventListener("click", function () { send(urlInput.value.trim(), false); });
  queueBtn.addEventListener("click", function () { send(urlInput.value.trim(), true); });
  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send(urlInput.value.trim(), false);
  });

  var np = document.getElementById("np");
  var npTitle = document.getElementById("np-title");
  var npPos = document.getElementById("np-pos");
  var npFill = document.getElementById("np-fill");
  var npToggle = document.getElementById("np-toggle");
  var npSkip = document.getElementById("np-skip");
  var npPrev = document.getElementById("np-prev");
  var npNext = document.getElementById("np-next");
  var npChapter = document.getElementById("np-chapter");
  var npRewind = document.getElementById("np-rewind");
  var npForward = document.getElementById("np-forward");
  var npMute = document.getElementById("np-mute");
  var npVolume = document.getElementById("np-volume");
  var npSlower = document.getElementById("np-slower");
  var npFaster = document.getElementById("np-faster");
  var npSpeed = document.getElementById("np-speed");
  var npStop = document.getElementById("np-stop");
  var dot = document.getElementById("dot");
  var lastStatus = null;

  function loadPlayer() {
    api("/player").then(function (p) {
      lastStatus = p;
      var alive = !!(p.alive && p.url);
      dot.className = "dot";
      np.hidden = !alive;
      if (!alive) return;
      npTitle.textContent = p.title || p.url;
      npTitle.title = p.url;
      npPos.textContent =
        fmt(p.position) + " / " + (p.duration > 0 ? fmt(p.duration) : "\\u2013");
      npFill.style.width =
        p.duration > 0
          ? Math.min(100, Math.round((p.position / p.duration) * 100)) + "%"
          : "0%";
      npToggle.innerHTML = p.paused
        ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:block;margin:0 auto"><polygon points="6 3 20 12 6 21 6 3"/></svg>'
        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:block;margin:0 auto"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
      npToggle.title = p.paused ? "Resume" : "Pause";
      npToggle.setAttribute("aria-label", npToggle.title);
      npToggle.disabled = !p.ipcReady;
      // Skip only makes sense when there is a queue to advance through.
      npSkip.hidden = !p.ipcReady || p.queue.length === 0;
      // Chapter navigation + label, when the media has chapters.
      var hasChapters = p.chapters.length > 0;
      npPrev.hidden = !hasChapters;
      npNext.hidden = !hasChapters;
      npPrev.disabled = !p.ipcReady || p.chapter === null || p.chapter <= 0;
      npNext.disabled =
        !p.ipcReady ||
        p.chapter === null ||
        p.chapter >= p.chapters.length - 1;
      if (p.chapter !== null && p.chapters[p.chapter]) {
        var c = p.chapters[p.chapter];
        npChapter.textContent =
          "Chapter " + (p.chapter + 1) + "/" + p.chapters.length +
          (c.title ? ": " + c.title : "");
        npChapter.hidden = false;
      } else {
        npChapter.textContent = "";
        npChapter.hidden = true;
      }
      // Volume + mute feedback.
      npMute.innerHTML = p.muted
        ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
      npMute.title = p.muted ? "Unmute" : "Mute";
      npVolume.value = Math.round(p.volume);
      npVolume.disabled = !p.ipcReady;
      npSpeed.textContent = p.speed.toFixed(2) + "\\u00d7";
      npSlower.disabled = !p.ipcReady || p.speed <= 0.25;
      npFaster.disabled = !p.ipcReady || p.speed >= 4;
      npStop.disabled = !p.ipcReady;
    }).catch(function () {
      dot.className = "dot off";
      np.hidden = true;
    });
  }

  npToggle.addEventListener("click", function () {
    api("/player/pause", { method: "POST" }).then(loadPlayer).catch(function () {});
  });
  npSkip.addEventListener("click", function () {
    api("/player/skip", { method: "POST" }).then(loadPlayer).catch(function () {});
  });
  npPrev.addEventListener("click", function () {
    api("/player/chapter-prev", { method: "POST" }).then(loadPlayer).catch(function () {});
  });
  npNext.addEventListener("click", function () {
    api("/player/chapter-next", { method: "POST" }).then(loadPlayer).catch(function () {});
  });
  npRewind.addEventListener("click", function () {
    var target = lastStatus ? Math.max(0, Math.floor(lastStatus.position - 10)) : 0;
    api("/player/seek", {
      method: "POST",
      body: JSON.stringify({ position: target }),
    }).then(loadPlayer).catch(function () {});
  });
  npForward.addEventListener("click", function () {
    var target = lastStatus ? Math.floor(lastStatus.position + 10) : 10;
    api("/player/seek", {
      method: "POST",
      body: JSON.stringify({ position: target }),
    }).then(loadPlayer).catch(function () {});
  });
  npMute.addEventListener("click", function () {
    api("/player/mute", { method: "POST" }).then(loadPlayer).catch(function () {});
  });
  npVolume.addEventListener("change", function () {
    api("/player/volume", {
      method: "POST",
      body: JSON.stringify({ volume: Number(npVolume.value) }),
    }).then(loadPlayer).catch(function () {});
  });
  npSlower.addEventListener("click", function () {
    var s = lastStatus ? Math.max(0.25, lastStatus.speed - 0.25) : 1;
    api("/player/speed", {
      method: "POST",
      body: JSON.stringify({ speed: s }),
    }).then(loadPlayer).catch(function () {});
  });
  npFaster.addEventListener("click", function () {
    var s = lastStatus ? Math.min(4, lastStatus.speed + 0.25) : 1;
    api("/player/speed", {
      method: "POST",
      body: JSON.stringify({ speed: s }),
    }).then(loadPlayer).catch(function () {});
  });
  npStop.addEventListener("click", function () {
    api("/player/stop", { method: "POST" }).then(loadPlayer).catch(function () {});
  });
  setInterval(loadPlayer, 3000);

  var pairCard = document.getElementById("pair");
  if (!token) pairCard.hidden = false;
  var pairInput = document.getElementById("pair-token");
  var pairBtn = document.getElementById("pair-btn");

  // Exchanges the master token for a revocable session token — the master
  // never gets stored on the phone.
  function pair() {
    var value = pairInput.value.trim();
    if (!value) {
      unauthorizedShown = true;
      showBanner("Paste the access token first", false);
      return;
    }
    pairBtn.disabled = true;
    fetch("/remote/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value, device: deviceLabel() }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok) {
          // Keep this message visible — the 3s polling must not overwrite it.
          unauthorizedShown = true;
          showBanner(r.data.err || "Pairing failed", false);
          return;
        }
        token = r.data.session;
        try {
          localStorage.setItem("ml-remote-token", token);
        } catch (e) {}
        pairCard.hidden = true;
        refreshUnpairRow();
        showBanner("Paired — connected to the desktop app.", true);
        loadRecent();
        loadPlayer();
      })
      .catch(function () {
        unauthorizedShown = true;
        showBanner("Pairing failed", false);
      })
      .finally(function () { pairBtn.disabled = false; });
  }
  pairBtn.addEventListener("click", pair);
  pairInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") pair();
  });

  var unpairRow = document.getElementById("unpair-row");
  var unpairBtn = document.getElementById("unpair");
  function refreshUnpairRow() {
    unpairRow.hidden = !token;
  }
  refreshUnpairRow();
  unpairBtn.addEventListener("click", function () {
    if (!token) return;
    unpairBtn.disabled = true;
    fetch("/remote/session", {
      method: "DELETE",
      headers: { "X-Auth-Token": token },
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (!r.ok && !(r.data.err || "").startsWith("no such session")) {
          showBanner(r.data.err || "Unpair failed", false);
          unpairBtn.disabled = false;
          return;
        }
        token = "";
        try {
          localStorage.removeItem("ml-remote-token");
        } catch (e) {}
        showBanner("Unpaired — this device can no longer control the player.", true);
        refreshUnpairRow();
        pairCard.hidden = false;
      })
      .finally(function () { unpairBtn.disabled = false; });
  });

  var recentList = document.getElementById("recent");
  function loadRecent() {
    api("/history").then(function (items) {
      recentList.innerHTML = "";
      items.slice(0, 10).forEach(function (e) {
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.title = e.url;
        var t = document.createElement("span");
        t.className = "t";
        t.textContent = e.title || e.url;
        b.appendChild(t);
        b.addEventListener("click", function () { send(e.url, false); });
        li.appendChild(b);
        recentList.appendChild(li);
      });
    }).catch(function () {});
  }

  loadRecent();
  loadPlayer();
</script>
</body>
</html>`;
}
