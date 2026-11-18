export function remoteClientScript(): string {
  return `  var token = "";
  var pairingExpiresAt = 0;
  var unauthorizedShown = false;
  var lastStatus = null;
  var scrubbing = false;
  var volumeBusy = false;
  var tickSig = "";
  var playedOpen = false;
  var errorEntryIndex = null;
  var queueSig = "";
  var playedSig = "";
  var thumbCache = {};
  var npArtUrl = "";
  var sending = false;
  var queueBusy = false;

  var banner = document.getElementById("banner");
  var bannerTimer = null;
  var npError = document.getElementById("np-error");
  var npErrorText = document.getElementById("np-error-text");
  var npErrorRetry = document.getElementById("np-error-retry");
  var npErrorDismiss = document.getElementById("np-error-dismiss");
  var reconnect = document.getElementById("reconnect");
  var wakeLockPill = document.getElementById("wake-lock");
  var secureHint = document.getElementById("secure-hint");
  var dot = document.getElementById("dot");
  var statusText = document.getElementById("status-text");
  var np = document.getElementById("np");
  var idle = document.getElementById("idle");
  var npTitle = document.getElementById("np-title");
  var npMeta = document.getElementById("np-meta");
  var npArt = document.getElementById("np-art");
  var npPos = document.getElementById("np-pos");
  var npDur = document.getElementById("np-dur");
  var npFill = document.getElementById("np-fill");
  var npTicks = document.getElementById("np-ticks");
  var npKnob = document.getElementById("np-knob");
  var npSeek = document.getElementById("np-seek");
  var npToggle = document.getElementById("np-toggle");
  var npSkip = document.getElementById("np-skip");
  var npPrev = document.getElementById("np-prev");
  var npNext = document.getElementById("np-next");
  var npRewind = document.getElementById("np-rewind");
  var npForward = document.getElementById("np-forward");
  var npMute = document.getElementById("np-mute");
  var npVolume = document.getElementById("np-volume");
  var npVolumeVal = document.getElementById("np-volume-val");
  var npSpeed = document.getElementById("np-speed");
  var npSpeedBtn = document.getElementById("np-speed-btn");
  var npSpeedMenu = document.getElementById("np-speed-menu");
  var npSpeedWrap = document.getElementById("np-speed-wrap");
  var npEq = document.getElementById("np-eq");
  var npPlaylist = document.getElementById("np-playlist");
  var npQueue = document.getElementById("np-queue");
  var npQueueLabel = document.getElementById("np-queue-label");
  var npQueueList = document.getElementById("np-queue-list");
  var npPlayed = document.getElementById("np-played");
  var npPlayedList = document.getElementById("np-played-list");
  var npShuffle = document.getElementById("np-shuffle");
  var npRepeat = document.getElementById("np-repeat");
  var npRepeatLabel = document.getElementById("np-repeat-label");
  var npClearQueue = document.getElementById("np-clear-queue");
  var npStop = document.getElementById("np-stop");
  var playBtn = document.getElementById("play");
  var queueBtn = document.getElementById("queue");
  var urlInput = document.getElementById("url");
  var sendCard = document.getElementById("send-card");
  var pairCard = document.getElementById("pair");
  var pairInput = document.getElementById("pair-code");
  var pairBtn = document.getElementById("pair-btn");
  var pairExpiry = document.getElementById("pair-expiry");
  var unpairRow = document.getElementById("unpair-row");
  var unpairBtn = document.getElementById("unpair");
  var recentCard = document.getElementById("recent-card");
  var recentList = document.getElementById("recent");
  var recentCount = document.getElementById("recent-count");

  function deviceLabel() {
    var ua = navigator.userAgent;
    var os = /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad/i.test(ua)
        ? "iOS"
        : "Desktop";
    var browser = /Firefox/i.test(ua)
      ? "Firefox"
      : /Edg/i.test(ua)
        ? "Edge"
        : /Chrome/i.test(ua)
          ? "Chrome"
          : "Browser";
    return os + " · " + browser;
  }

  function hostOf(value) {
    try {
      var host = new URL(value).hostname;
      return host.indexOf("www.") === 0 ? host.slice(4) : host;
    } catch (e) {
      return value;
    }
  }

  function trackLabel(item) {
    if (item.title) return item.title;
    if (item.source === "playlist" && item.playlistIndex) {
      return "Track " + item.playlistIndex;
    }
    return hostOf(item.url);
  }

  function loadThumb(img, url, stillWanted) {
    if (!url) {
      img.hidden = true;
      return;
    }
    function apply(src) {
      if (stillWanted && !stillWanted()) return;
      img.src = src;
      img.hidden = false;
    }
    if (thumbCache[url]) {
      apply(thumbCache[url]);
      return;
    }
    fetch("/thumbnail?url=" + encodeURIComponent(url), {
      headers: { "X-Auth-Token": token },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("thumbnail");
        return res.blob();
      })
      .then(function (blob) {
        var src = URL.createObjectURL(blob);
        thumbCache[url] = src;
        apply(src);
      })
      .catch(function () {
        if (!stillWanted || stillWanted()) img.hidden = true;
      });
  }

  function setArt(url) {
    if (url === npArtUrl) return;
    npArtUrl = url;
    if (!url) {
      npArt.hidden = true;
      npArt.removeAttribute("src");
      return;
    }
    npArt.hidden = true;
    loadThumb(npArt, url, function () { return npArtUrl === url; });
  }

  function fmt(total) {
    var s = Math.max(0, Math.floor(total || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) {
      return h + ":" + ("0" + m).slice(-2) + ":" + ("0" + sec).slice(-2);
    }
    return m + ":" + ("0" + sec).slice(-2);
  }

  function formatSpeed(speed) {
    return Number(speed.toFixed(2)) + "×";
  }

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    if (!isFinite(diff) || diff < 0) return "Just now";
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    var days = Math.floor(hours / 24);
    if (days < 7) return days + "d ago";
    return new Date(ts).toLocaleDateString();
  }

  function showBanner(text, ok) {
    banner.textContent = text;
    banner.className = "banner" + (ok ? " ok" : "");
    banner.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { banner.hidden = true; }, ok ? 2000 : 6000);
  }

  function setStatus(mode) {
    var cls = "dot";
    var label = "Idle";
    if (mode === "playing") {
      cls += " on";
      label = "Playing";
    } else if (mode === "paused") {
      cls += " paused";
      label = "Paused";
    } else if (mode === "offline") {
      cls += " off";
      label = "Offline";
    } else if (mode === "unpaired") {
      label = "Not paired";
    }
    dot.className = cls;
    statusText.textContent = label;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "X-Auth-Token": token }, opts.headers || {});
    if (opts.body) opts.headers["Content-Type"] = "application/json";
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        // The session was revoked or has expired. Forget it so polling stops
        // and the pair card stays visible.
        token = "";
        try {
          localStorage.removeItem("ml-remote-token");
        } catch (e) {}
        syncAuthUI();
        // Show once per unauthorized state — the 3s polling must not
        // overwrite more specific messages (e.g. pair/rate-limit errors).
        if (!unauthorizedShown) {
          unauthorizedShown = true;
          showBanner("Unauthorized — pair this device below.", false);
        }
        throw new Error("unauthorized");
      }
      unauthorizedShown = false;
      pairCard.hidden = true;
      return res.json();
    });
  }

  function readJson(res) {
    return res
      .json()
      .catch(function () { return {}; })
      .then(function (data) { return { ok: res.ok, data: data }; });
  }

  function exchangePairingCode(code) {
    return fetch("/remote/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, device: deviceLabel() }),
    }).then(readJson);
  }

  function rememberSession(session) {
    token = session;
    try {
      localStorage.setItem("ml-remote-token", token);
    } catch (e) {}
  }

  function control(path) {
    api(path, { method: "POST" }).then(loadPlayer).catch(function () {});
  }

  function isHttp(u) { return /^https?:\\/\\//i.test(u); }

  function send(url, queue) {
    if (!token) {
      showBanner("Pair this device first.", false);
      return;
    }
    if (!isHttp(url)) {
      showBanner("Enter a valid http(s) URL", false);
      return;
    }
    playBtn.disabled = true;
    queueBtn.disabled = true;
    sending = true;
    api("/", { method: "POST", body: JSON.stringify({ url: url, queue: !!queue }) })
      .then(function (data) {
        if (data && data.err) throw new Error(data.err);
        var count =
          data && data.playlist && typeof data.playlist.count === "number"
            ? data.playlist.count
            : 1;
        showBanner(
          queue
            ? count > 1
              ? "Queued " + count + " videos"
              : "Added to queue"
            : "Sent to player",
          true,
        );
        urlInput.value = "";
        loadRecent();
        loadPlayer();
      })
      .catch(function (err) {
        if (err && err.message === "unauthorized") return;
        showBanner(
          err && err.message ? err.message : "Could not reach the player — try again.",
          false,
        );
        loadPlayer();
      })
      .finally(function () {
        sending = false;
        playBtn.disabled = false;
        if (lastStatus) {
          queueBtn.disabled = !(lastStatus.alive && lastStatus.ipcReady);
          queueBtn.title = queueBtn.disabled
            ? "Start a video before queueing another"
            : "Add this URL to the queue";
        } else {
          queueBtn.disabled = false;
        }
      });
  }

  playBtn.addEventListener("click", function () { send(urlInput.value.trim(), false); });
  queueBtn.addEventListener("click", function () { send(urlInput.value.trim(), true); });
  urlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send(urlInput.value.trim(), false);
  });

  function updateProgress(position, duration) {
    var ratio = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
    npFill.style.width = (ratio * 100) + "%";
    npKnob.style.left = (ratio * 100) + "%";
    npPos.textContent = fmt(position);
    npSeek.setAttribute("aria-valuemax", String(Math.round(duration)));
    npSeek.setAttribute("aria-valuenow", String(Math.round(position)));
    npSeek.setAttribute(
      "aria-valuetext",
      fmt(position) + " of " + (duration > 0 ? fmt(duration) : "unknown"),
    );
  }

  function renderTicks(chapters, duration) {
    var times = [];
    for (var i = 0; i < chapters.length; i++) times.push(chapters[i].time);
    var sig = duration + "|" + times.join(",");
    if (sig === tickSig) return;
    tickSig = sig;
    npTicks.innerHTML = "";
    if (duration <= 0) return;
    for (var j = 0; j < chapters.length; j++) {
      var t = chapters[j].time;
      if (!(t > 0) || t >= duration) continue;
      var tick = document.createElement("span");
      tick.className = "seek-tick";
      tick.style.left = (t / duration * 100) + "%";
      npTicks.appendChild(tick);
    }
  }

  function buildPlayed(past) {
    npPlayedList.innerHTML = "";
    for (var i = 0; i < past.length; i++) {
      var item = past[i];
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.title = "Play " + trackLabel(item) + " again";
      var check = document.createElement("span");
      check.className = "check";
      check.textContent = "✓";
      var t = document.createElement("span");
      t.className = "t";
      t.textContent = trackLabel(item);
      btn.appendChild(check);
      btn.appendChild(t);
      (function (index) {
        btn.addEventListener("click", function () {
          api("/player/queue/play", {
            method: "POST",
            body: JSON.stringify({ index: index }),
          })
            .then(loadPlayer)
            .catch(function () {});
        });
      })(item.index);
      li.appendChild(btn);
      npPlayedList.appendChild(li);
    }
    var clearLi = document.createElement("li");
    clearLi.className = "played-clear";
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear played";
    clearBtn.title = "Remove all played tracks from the queue";
    clearBtn.addEventListener("click", function () {
      if (!window.confirm("Clear all played tracks from the queue?")) return;
      api("/player/queue/clear-played", { method: "POST" })
        .then(loadPlayer)
        .catch(function () {});
    });
    clearLi.appendChild(clearBtn);
    npPlayedList.appendChild(clearLi);
  }

  var playlistIcon =
    '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M3 5h11v2H3zM3 11h8v2H3zM3 17h8v2H3z"/><polygon points="16 10 22 13 16 16"/></svg>';

  function hasCurrentPlaylistMore(p) {
    return (
      p.source === "playlist" &&
      !!p.playlistUrl &&
      !!p.playlistId &&
      typeof p.playlistIndex === "number" &&
      typeof p.playlistTotal === "number" &&
      p.playlistIndex < p.playlistTotal
    );
  }

  function setQueueBusy(button) {
    if (queueBusy) return false;
    queueBusy = true;
    queueSig = "";
    if (button) {
      button.disabled = true;
      button.textContent = "…";
    }
    return true;
  }

  function queueActionFailed(label, err) {
    if (err && err.message === "unauthorized") return;
    showBanner(
      label + (err && err.message ? ": " + err.message : ""),
      false,
    );
  }

  function finishQueueBusy() {
    queueBusy = false;
    queueSig = "";
    loadPlayer();
  }

  function loadMorePlaylist(playlistUrl, playlistId, button) {
    if (!setQueueBusy(button)) return;
    api("/player/queue/load-playlist", {
      method: "POST",
      body: JSON.stringify({
        playlistUrl: playlistUrl,
        playlistId: playlistId,
      }),
    })
      .then(function (data) {
        if (data && data.err) throw new Error(data.err);
        finishQueueBusy();
      })
      .catch(function (err) {
        queueBusy = false;
        queueSig = "";
        queueActionFailed("Could not load more", err);
        loadPlayer();
      });
  }

  function moveQueueItem(index, direction) {
    api("/player/queue/move", {
      method: "POST",
      body: JSON.stringify({ index: index, direction: direction }),
    })
      .then(function (data) {
        if (data && data.err) throw new Error(data.err);
        queueSig = "";
        loadPlayer();
      })
      .catch(function (err) {
        queueActionFailed("Could not move that item", err);
      });
  }

  function buildQueue(queue, ipcReady, player) {
    var scrollTop = npQueueList.scrollTop;
    npQueueList.innerHTML = "";
    var positions = {};
    queue.forEach(function (item, index) {
      positions[item.index] = index;
    });

    var groups = [];
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      var playlistId =
        item.source === "playlist" ? item.playlistId || "playlist" : null;
      var last = groups.length > 0 ? groups[groups.length - 1] : null;
      if (last && last.playlistId === playlistId) {
        last.items.push(item);
      } else {
        groups.push({
          playlistId: playlistId,
          title: item.playlistTitle || "Playlist",
          items: [item],
        });
      }
    }

    var currentGrouped = groups.some(function (group) {
      return group.playlistId === player.playlistId;
    });
    if (hasCurrentPlaylistMore(player) && !currentGrouped) {
      var currentRow = document.createElement("li");
      currentRow.className = "load-more-row";
      var currentLabel = document.createElement("span");
      currentLabel.className = "t";
      currentLabel.textContent =
        (player.playlistTitle || "Playlist") +
        " · track " +
        player.playlistIndex +
        " of " +
        player.playlistTotal;
      var currentMore = document.createElement("button");
      currentMore.type = "button";
      currentMore.textContent = queueBusy ? "…" : "Load more";
      currentMore.disabled = queueBusy;
      currentMore.addEventListener("click", function () {
        loadMorePlaylist(
          player.playlistUrl,
          player.playlistId,
          currentMore,
        );
      });
      currentRow.appendChild(currentLabel);
      currentRow.appendChild(currentMore);
      npQueueList.appendChild(currentRow);
    }

    groups.forEach(function (group) {
      var head = document.createElement("li");
      head.className = "group-head";
      if (group.playlistId) {
        var glyph = document.createElement("span");
        glyph.className = "source";
        glyph.innerHTML = playlistIcon;
        head.appendChild(glyph);
      }
      var label = document.createElement("span");
      label.className = "grow";
      label.textContent = group.playlistId ? group.title : "Queued";
      head.appendChild(label);
      var count = document.createElement("span");
      count.className = "n";
      count.textContent = String(group.items.length);
      head.appendChild(count);

      var groupMax = 0;
      var groupTotal = null;
      var groupUrl = null;
      group.items.forEach(function (entry) {
        if (typeof entry.playlistIndex === "number") {
          groupMax = Math.max(groupMax, entry.playlistIndex);
        }
        if (typeof entry.playlistTotal === "number") {
          groupTotal = entry.playlistTotal;
        }
        if (entry.playlistUrl) groupUrl = entry.playlistUrl;
      });
      if (
        group.playlistId &&
        groupUrl &&
        groupTotal !== null &&
        groupMax < groupTotal &&
        ipcReady
      ) {
        var groupMore = document.createElement("button");
        groupMore.type = "button";
        groupMore.className = "more";
        groupMore.textContent = queueBusy ? "…" : "Load more";
        groupMore.disabled = queueBusy;
        groupMore.title = "Load the next page of this playlist";
        groupMore.setAttribute(
          "aria-label",
          "Load more from " + group.title,
        );
        (function (url, id) {
          groupMore.addEventListener("click", function () {
            loadMorePlaylist(url, id, groupMore);
          });
        })(groupUrl, group.playlistId);
        head.appendChild(groupMore);
      }

      if (group.playlistId && ipcReady) {
        var removeAll = document.createElement("button");
        removeAll.type = "button";
        removeAll.className = "remove";
        removeAll.textContent = "Remove";
        removeAll.title = "Remove this playlist from the queue";
        removeAll.disabled = queueBusy;
        removeAll.setAttribute(
          "aria-label",
          "Remove " + group.title + " from the queue",
        );
        (function (id, title, total) {
          removeAll.addEventListener("click", function () {
            if (
              !window.confirm(
                "Remove " +
                  total +
                  " upcoming video" +
                  (total === 1 ? "" : "s") +
                  ' from "' +
                  title +
                  '"?',
              )
            ) {
              return;
            }
            api("/player/queue/remove-playlist", {
              method: "POST",
              body: JSON.stringify({ playlistId: id }),
            })
              .then(function () {
                queueSig = "";
                loadPlayer();
              })
              .catch(function () {});
          });
        })(group.playlistId, group.title, group.items.length);
        head.appendChild(removeAll);
      }
      npQueueList.appendChild(head);

      group.items.forEach(function (item, itemIndex) {
        var li = document.createElement("li");
        li.className = "queue-item";
        var main = document.createElement("button");
        main.type = "button";
        main.className = "q-main";
        main.title = "Play " + trackLabel(item);
        main.setAttribute("aria-label", "Play " + trackLabel(item));
        var n = document.createElement("span");
        n.className = "n";
        n.textContent = String(
          group.playlistId ? item.playlistIndex || itemIndex + 1 : itemIndex + 1,
        );
        var t = document.createElement("span");
        t.className = "t";
        t.textContent = trackLabel(item);
        main.appendChild(n);
        main.appendChild(t);
        (function (index) {
          main.addEventListener("click", function () {
            api("/player/queue/play", {
              method: "POST",
              body: JSON.stringify({ index: index }),
            })
              .then(loadPlayer)
              .catch(function () {});
          });
        })(item.index);
        li.appendChild(main);

        var position = positions[item.index] || 0;
        var up = document.createElement("button");
        up.type = "button";
        up.className = "q-move";
        up.title = "Move up";
        up.setAttribute("aria-label", "Move " + trackLabel(item) + " up");
        up.disabled = !ipcReady || queueBusy || position <= 0;
        up.innerHTML =
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
        (function (index) {
          up.addEventListener("click", function () {
            if (!up.disabled) moveQueueItem(index, "up");
          });
        })(item.index);
        li.appendChild(up);

        var down = document.createElement("button");
        down.type = "button";
        down.className = "q-move";
        down.title = "Move down";
        down.setAttribute("aria-label", "Move " + trackLabel(item) + " down");
        down.disabled = !ipcReady || queueBusy || position >= queue.length - 1;
        down.innerHTML =
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
        (function (index) {
          down.addEventListener("click", function () {
            if (!down.disabled) moveQueueItem(index, "down");
          });
        })(item.index);
        li.appendChild(down);

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "q-remove";
        remove.title = "Remove from queue";
        remove.setAttribute(
          "aria-label",
          "Remove " + trackLabel(item) + " from the queue",
        );
        remove.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        remove.disabled = !ipcReady || queueBusy;
        (function (index) {
          remove.addEventListener("click", function () {
            api("/player/queue/remove", {
              method: "POST",
              body: JSON.stringify({ index: index }),
            })
              .then(function () {
                queueSig = "";
                loadPlayer();
              })
              .catch(function () {});
          });
        })(item.index);
        li.appendChild(remove);
        npQueueList.appendChild(li);
      });
    });
    npQueueList.scrollTop = scrollTop;
  }

  function queueFingerprint(p, queue) {
    var parts = [
      p.ipcReady ? "1" : "0",
      p.playlistId || "",
      typeof p.playlistIndex === "number" ? p.playlistIndex : "",
      typeof p.playlistTotal === "number" ? p.playlistTotal : "",
      p.playlistUrl || "",
    ];
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      parts.push(
        [
          item.index,
          item.url,
          item.title,
          item.playlistId || "",
          item.playlistIndex || "",
        ].join(":"),
      );
    }
    return parts.join("|");
  }

  function playedFingerprint(past) {
    var parts = [];
    for (var i = 0; i < past.length; i++) {
      parts.push(past[i].index + ":" + past[i].url);
    }
    return parts.join("|");
  }

  function refreshSpeedUI(speed) {
    npSpeed.textContent = formatSpeed(speed);
    var items = npSpeedMenu.querySelectorAll("button");
    for (var i = 0; i < items.length; i++) {
      var active = Math.abs(Number(items[i].getAttribute("data-speed")) - speed) < 0.01;
      items[i].setAttribute("aria-checked", active ? "true" : "false");
    }
  }

  function setSpeedMenuOpen(open) {
    npSpeedMenu.hidden = !open;
    npSpeedBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function seekToPosition(seconds, done) {
    var finish = function () { if (done) done(); };
    api("/player/seek", {
      method: "POST",
      body: JSON.stringify({ position: Math.max(0, Math.round(seconds)) }),
    })
      .then(function () { finish(); loadPlayer(); })
      .catch(function () { finish(); loadPlayer(); });
  }

  function loadPlayer() {
    if (!token) return;
    api("/player").then(function (p) {
      reconnect.hidden = true;
      lastStatus = p;
      var alive = !!(p.alive && p.url);
      setStatus(alive ? (p.paused ? "paused" : "playing") : "idle");
      np.hidden = !alive;
      idle.hidden = alive;
      var queue = p.queue || [];
      var past = p.past || [];
      if (p.error) {
        var errorLabel = p.error.title;
        if (!errorLabel && typeof p.error.playlistIndex === "number") {
          errorLabel =
            "Track " + p.error.playlistIndex +
            (p.error.playlistTitle ? " of " + p.error.playlistTitle : "");
        }
        npErrorText.textContent =
          "Couldn't play “" + (errorLabel || "that video") + "”";
        npError.title = p.error.message || "";
        npError.hidden = false;
        errorEntryIndex = null;
        var candidates = past.concat(queue);
        for (var ei = 0; ei < candidates.length; ei++) {
          if (candidates[ei].url === p.error.url) {
            errorEntryIndex = candidates[ei].index;
            break;
          }
        }
        npErrorRetry.hidden = errorEntryIndex === null;
      } else {
        errorEntryIndex = null;
        npErrorRetry.hidden = true;
        npError.hidden = true;
        npError.removeAttribute("title");
      }
      if (!sending) {
        queueBtn.disabled = !(alive && p.ipcReady);
        queueBtn.title = queueBtn.disabled
          ? "Start a video before queueing another"
          : "Add this URL to the queue";
      }
      setArt(alive ? p.thumbnail || "" : "");
      if (!alive) return;

      var chapters = p.chapters || [];
      var duration = p.duration > 0 ? p.duration : 0;

      npTitle.textContent = p.title || p.url;
      npTitle.title = p.url;
      var meta = hostOf(p.url);
      if (p.chapter !== null && chapters[p.chapter]) {
        var chapter = chapters[p.chapter];
        meta += " · Chapter " + (p.chapter + 1) + "/" + chapters.length +
          (chapter.title ? " — " + chapter.title : "");
      }
      npMeta.textContent = meta;

      npDur.textContent = duration > 0 ? fmt(duration) : "—";
      renderTicks(chapters, duration);
      if (!scrubbing) updateProgress(p.position || 0, duration);
      npSeek.setAttribute(
        "aria-disabled",
        p.ipcReady && duration > 0 ? "false" : "true",
      );

      npEq.className = p.paused ? "eq paused" : "eq";
      if (p.source === "playlist" && p.playlistTitle) {
        npPlaylist.hidden = false;
        npPlaylist.title = "From " + p.playlistTitle;
      } else {
        npPlaylist.hidden = true;
        npPlaylist.removeAttribute("title");
      }
      npToggle.innerHTML = p.paused
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><polygon points="7.5 4.5 20 12 7.5 19.5"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6.5" y="4.5" width="4" height="15" rx="1.2"/><rect x="13.5" y="4.5" width="4" height="15" rx="1.2"/></svg>';
      npToggle.title = p.paused ? "Resume" : "Pause";
      npToggle.setAttribute("aria-label", npToggle.title);
      npToggle.disabled = !p.ipcReady;

      npRewind.disabled = !p.ipcReady || p.position <= 0;
      npForward.disabled = !p.ipcReady || (duration > 0 && p.position >= duration);

      var hasChapters = chapters.length > 0;
      npPrev.hidden = !hasChapters;
      npNext.hidden = !hasChapters;
      npPrev.disabled = !p.ipcReady || p.chapter === null || p.chapter <= 0;
      npNext.disabled =
        !p.ipcReady || p.chapter === null || p.chapter >= chapters.length - 1;

      if (past.length === 0) {
        playedOpen = false;
        playedSig = "";
        npPlayed.hidden = true;
        npPlayedList.hidden = true;
        npPlayedList.innerHTML = "";
        npPlayed.setAttribute("aria-expanded", "false");
      } else {
        npPlayed.hidden = false;
        npPlayed.textContent = "✓ " + past.length + " played";
        npPlayed.setAttribute("aria-expanded", playedOpen ? "true" : "false");
        npPlayedList.hidden = !playedOpen;
        var psig = playedFingerprint(past);
        if (playedOpen && psig !== playedSig) {
          playedSig = psig;
          buildPlayed(past);
        }
      }
      npQueue.hidden =
        queue.length === 0 &&
        past.length === 0 &&
        !hasCurrentPlaylistMore(p);
      npQueueLabel.textContent = "Up next · " + queue.length;
      npSkip.hidden = !p.ipcReady || queue.length === 0;
      npShuffle.disabled = !p.ipcReady || queue.length < 2 || queueBusy;
      npShuffle.textContent = queueBusy ? "…" : "Shuffle";
      npClearQueue.disabled = !p.ipcReady || queue.length === 0 || queueBusy;
      npRepeat.disabled = !p.ipcReady;
      var repeatMode = p.repeat || "off";
      npRepeatLabel.textContent =
        repeatMode === "one" ? "1" : repeatMode === "all" ? "All" : "Off";
      npRepeat.className = "chip" + (repeatMode === "off" ? "" : " on");
      npRepeat.title =
        repeatMode === "one"
          ? "Repeat one — tap to turn off"
          : repeatMode === "all"
            ? "Repeat all — tap for repeat one"
            : "Repeat off — tap for repeat all";
      npRepeat.setAttribute("aria-label", "Repeat " + repeatMode);
      var qsig = queueFingerprint(p, queue);
      if (qsig !== queueSig) {
        queueSig = qsig;
        buildQueue(queue, p.ipcReady, p);
      }

      npMute.innerHTML = p.muted
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
      npMute.title = p.muted ? "Unmute" : "Mute";
      npMute.setAttribute("aria-label", npMute.title);
      npMute.disabled = !p.ipcReady;
      if (!volumeBusy) {
        var volume = Math.round(p.volume);
        npVolume.value = volume;
        npVolumeVal.textContent = volume + "%";
        npVolume.style.setProperty("--fill", volume + "%");
      }
      npVolume.disabled = !p.ipcReady;

      refreshSpeedUI(p.speed);
      npSpeedBtn.disabled = !p.ipcReady;
      if (!p.ipcReady) setSpeedMenuOpen(false);
      npStop.disabled = !p.ipcReady;
    }).catch(function () {
      np.hidden = true;
      idle.hidden = true;
      reconnect.hidden = !token;
      setStatus(token ? "offline" : "unpaired");
    });
  }

  npToggle.addEventListener("click", function () { control("/player/pause"); });
  npSkip.addEventListener("click", function () { control("/player/skip"); });
  npShuffle.addEventListener("click", function () {
    if (!setQueueBusy(npShuffle)) return;
    api("/player/queue/shuffle", { method: "POST" })
      .then(function (data) {
        if (data && data.err) throw new Error(data.err);
        finishQueueBusy();
      })
      .catch(function (err) {
        queueBusy = false;
        queueSig = "";
        queueActionFailed("Could not shuffle", err);
        loadPlayer();
      });
  });
  npRepeat.addEventListener("click", function () {
    var mode = (lastStatus && lastStatus.repeat) || "off";
    var next = mode === "off" ? "all" : mode === "all" ? "one" : "off";
    api("/player/repeat", {
      method: "POST",
      body: JSON.stringify({ mode: next }),
    })
      .then(function (data) {
        if (data && data.err) throw new Error(data.err);
        loadPlayer();
      })
      .catch(function (err) {
        queueActionFailed("Could not change repeat mode", err);
      });
  });
  npClearQueue.addEventListener("click", function () {
    if (!window.confirm("Clear the queue?")) return;
    api("/player/queue/clear", { method: "POST" })
      .then(function (data) {
        if (data && data.err) throw new Error(data.err);
        queueSig = "";
        loadPlayer();
      })
      .catch(function (err) {
        queueActionFailed("Could not clear the queue", err);
      });
  });
  npPlayed.addEventListener("click", function () {
    playedOpen = !playedOpen;
    npPlayed.setAttribute("aria-expanded", playedOpen ? "true" : "false");
    npPlayedList.hidden = !playedOpen;
    if (playedOpen && lastStatus) {
      var past = lastStatus.past || [];
      playedSig = playedFingerprint(past);
      buildPlayed(past);
    }
  });
  npErrorRetry.addEventListener("click", function () {
    if (errorEntryIndex === null) return;
    var index = errorEntryIndex;
    api("/player/queue/play", {
      method: "POST",
      body: JSON.stringify({ index: index }),
    })
      .then(function () { return api("/player/clear-error", { method: "POST" }); })
      .then(loadPlayer)
      .catch(function () {});
  });
  npErrorDismiss.addEventListener("click", function () {
    npError.hidden = true;
    npErrorRetry.hidden = true;
    api("/player/clear-error", { method: "POST" }).catch(function () {});
  });
  npPrev.addEventListener("click", function () { control("/player/chapter-prev"); });
  npNext.addEventListener("click", function () { control("/player/chapter-next"); });
  npRewind.addEventListener("click", function () {
    var target = lastStatus ? Math.max(0, lastStatus.position - 10) : 0;
    seekToPosition(target);
  });
  npForward.addEventListener("click", function () {
    var target = lastStatus ? lastStatus.position + 10 : 10;
    seekToPosition(target);
  });
  npMute.addEventListener("click", function () { control("/player/mute"); });
  npStop.addEventListener("click", function () { control("/player/stop"); });

  npVolume.addEventListener("pointerdown", function () { volumeBusy = true; });
  npVolume.addEventListener("pointerup", function () {
    // A tap that doesn't change the value fires no change event; release the
    // polling lock anyway so the UI stays in sync.
    setTimeout(function () { volumeBusy = false; }, 500);
  });
  npVolume.addEventListener("pointercancel", function () { volumeBusy = false; });
  npVolume.addEventListener("input", function () {
    var value = Math.round(Number(npVolume.value));
    npVolumeVal.textContent = value + "%";
    npVolume.style.setProperty("--fill", value + "%");
  });
  npVolume.addEventListener("change", function () {
    api("/player/volume", {
      method: "POST",
      body: JSON.stringify({ volume: Number(npVolume.value) }),
    })
      .then(loadPlayer)
      .catch(function () {})
      .finally(function () { volumeBusy = false; });
  });

  function canSeek() {
    return !!(lastStatus && lastStatus.ipcReady && lastStatus.duration > 0);
  }

  function seekRatioFromEvent(clientX) {
    var rect = npSeek.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function previewSeek(ratio) {
    var duration = lastStatus && lastStatus.duration > 0 ? lastStatus.duration : 0;
    npFill.style.width = (ratio * 100) + "%";
    npKnob.style.left = (ratio * 100) + "%";
    if (duration > 0) {
      npPos.textContent = fmt(ratio * duration);
      npSeek.setAttribute("aria-valuenow", String(Math.round(ratio * duration)));
      npSeek.setAttribute(
        "aria-valuetext",
        fmt(ratio * duration) + " of " + fmt(duration),
      );
    }
  }

  npSeek.addEventListener("pointerdown", function (e) {
    if (!canSeek()) return;
    scrubbing = true;
    try { npSeek.setPointerCapture(e.pointerId); } catch (err) {}
    previewSeek(seekRatioFromEvent(e.clientX));
  });
  npSeek.addEventListener("pointermove", function (e) {
    if (!scrubbing) return;
    previewSeek(seekRatioFromEvent(e.clientX));
  });
  npSeek.addEventListener("pointerup", function (e) {
    if (!scrubbing) return;
    var ratio = seekRatioFromEvent(e.clientX);
    previewSeek(ratio);
    seekToPosition(ratio * (lastStatus ? lastStatus.duration : 0), function () {
      scrubbing = false;
    });
  });
  npSeek.addEventListener("pointercancel", function () {
    scrubbing = false;
    loadPlayer();
  });
  npSeek.addEventListener("keydown", function (e) {
    if (!canSeek()) return;
    var position = lastStatus.position;
    var duration = lastStatus.duration;
    var target = null;
    if (e.key === "ArrowLeft") target = Math.max(0, position - 5);
    else if (e.key === "ArrowRight") target = Math.min(duration, position + 5);
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = duration;
    if (target === null) return;
    e.preventDefault();
    seekToPosition(target);
  });

  npSpeedBtn.addEventListener("click", function () {
    setSpeedMenuOpen(npSpeedMenu.hidden);
  });
  npSpeedMenu.addEventListener("click", function (e) {
    var target = e.target;
    var btn = target && target.closest ? target.closest("button[data-speed]") : null;
    if (!btn) return;
    var speed = Number(btn.getAttribute("data-speed"));
    setSpeedMenuOpen(false);
    if (lastStatus && Math.abs(lastStatus.speed - speed) < 0.01) return;
    api("/player/speed", {
      method: "POST",
      body: JSON.stringify({ speed: speed }),
    }).then(loadPlayer).catch(function () {});
  });
  document.addEventListener("pointerdown", function (e) {
    if (npSpeedMenu.hidden) return;
    if (!npSpeedWrap.contains(e.target)) setSpeedMenuOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !npSpeedMenu.hidden) {
      setSpeedMenuOpen(false);
      npSpeedBtn.focus();
    }
  });

  setInterval(loadPlayer, 3000);

  function updatePairExpiry() {
    if (!pairingExpiresAt) {
      pairExpiry.hidden = true;
      return;
    }
    var remaining = pairingExpiresAt - Date.now();
    if (remaining <= 0) {
      pairExpiry.textContent =
        "This pairing code has expired — generate a new one in the desktop app.";
      pairExpiry.className = "hint warn";
    } else {
      var minutes = Math.floor(remaining / 60000);
      var seconds = Math.floor((remaining % 60000) / 1000);
      pairExpiry.textContent =
        "This pairing code expires in " + minutes + ":" +
        String(seconds).padStart(2, "0") + ".";
      pairExpiry.className = "hint";
    }
    pairExpiry.hidden = false;
  }
  setInterval(updatePairExpiry, 1000);
  updatePairExpiry();

  // Exchanges a short-lived pairing code for a revocable session token.
  function pair() {
    var value = pairInput.value.trim();
    if (!value) {
      unauthorizedShown = true;
      showBanner("Paste the pairing code first", false);
      return;
    }
    pairBtn.disabled = true;
    exchangePairingCode(value)
      .then(function (r) {
        if (!r.ok) {
          // Keep this message visible — the 3s polling must not overwrite it.
          unauthorizedShown = true;
          showBanner(r.data.err || "Pairing failed", false);
          return;
        }
        rememberSession(r.data.session);
        syncAuthUI();
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

  function syncAuthUI() {
    var paired = !!token;
    pairCard.hidden = paired;
    sendCard.hidden = !paired;
    unpairRow.hidden = !paired;
  }
  unpairBtn.addEventListener("click", function () {
    if (!token) return;
    unpairBtn.disabled = true;
    fetch("/remote/session", {
      method: "DELETE",
      headers: { "X-Auth-Token": token },
    })
      .then(readJson)
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
        syncAuthUI();
        np.hidden = true;
        idle.hidden = true;
        recentCard.hidden = true;
        recentList.innerHTML = "";
        setStatus("unpaired");
      })
      .finally(function () { unpairBtn.disabled = false; });
  });

  function loadRecent() {
    if (!token) return;
    api("/history").then(function (items) {
      recentList.innerHTML = "";
      items = items.slice(0, 10);
      recentCard.hidden = items.length === 0;
      recentCount.textContent = items.length + (items.length === 1 ? " item" : " items");
      items.forEach(function (e) {
        var li = document.createElement("li");
        li.className = "recent-row";
        var label = e.title || hostOf(e.url);

        var play = document.createElement("button");
        play.type = "button";
        play.className = "recent-main";
        play.title = e.url;
        play.setAttribute("aria-label", "Play " + label);
        var icon = document.createElement("span");
        icon.className = "recent-icon";
        if (e.thumbnail) {
          var thumb = document.createElement("img");
          thumb.className = "recent-thumb";
          thumb.alt = "";
          thumb.loading = "lazy";
          icon.appendChild(thumb);
          loadThumb(thumb, e.thumbnail, function () {
            return thumb.isConnected;
          });
        } else {
          icon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><polygon points="7 4 21 12 7 20 7 4"/></svg>';
        }
        var info = document.createElement("span");
        info.className = "recent-info";
        var title = document.createElement("span");
        title.className = "recent-title";
        title.textContent = label;
        var meta = document.createElement("span");
        meta.className = "recent-meta";
        var bits = [hostOf(e.url)];
        if (e.timestamp) bits.push(timeAgo(e.timestamp));
        if (typeof e.position === "number" && e.position > 2) {
          bits.push("Resume " + fmt(e.position));
        }
        meta.textContent = bits.join(" · ");
        info.appendChild(title);
        info.appendChild(meta);
        play.appendChild(icon);
        play.appendChild(info);
        play.addEventListener("click", function () { send(e.url, false); });

        var add = document.createElement("button");
        add.type = "button";
        add.className = "recent-queue";
        add.title = "Add to queue";
        add.setAttribute("aria-label", "Add to queue: " + label);
        add.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
        add.addEventListener("click", function () { send(e.url, true); });

        li.appendChild(play);
        li.appendChild(add);
        recentList.appendChild(li);
      });
    }).catch(function () {});
  }

  try {
    var params = new URLSearchParams(location.search);
    var code = params.get("c");
    var savedToken = localStorage.getItem("ml-remote-token") || "";
    var expiresAt = Number(params.get("e")) || 0;
    if (expiresAt > 0) pairingExpiresAt = expiresAt;
    if (!code && params.has("t")) {
      // Old links embedded the master token; never leave it in the address bar.
      history.replaceState(null, "", location.pathname);
    }
    if (code) {
      // Pairing: exchange a one-time short-lived code for a revocable session
      // token; the master token never reaches the phone.
      history.replaceState(null, "", location.pathname);
      exchangePairingCode(code)
        .then(function (r) {
          if (r.ok && r.data.session) {
            rememberSession(r.data.session);
            banner.hidden = true;
            unauthorizedShown = false;
            syncAuthUI();
            loadRecent();
            loadPlayer();
            return;
          }
          if (savedToken) {
            // A used/expired link must not unpair a phone that already has a
            // valid session.
            token = savedToken;
            showBanner(
              "That pairing link is no longer valid — continuing with the saved session.",
              false,
            );
          } else {
            token = "";
            try {
              localStorage.removeItem("ml-remote-token");
            } catch (e) {}
            showBanner(
              r.data.err || "Pairing link expired — scan a new QR code.",
              false,
            );
          }
          syncAuthUI();
          loadRecent();
          loadPlayer();
        })
        .catch(function () {
          if (savedToken) {
            token = savedToken;
            showBanner(
              "Could not refresh pairing — continuing with the saved session.",
              false,
            );
          } else {
            token = "";
            showBanner("Could not reach the server — try again.", false);
          }
          syncAuthUI();
          loadRecent();
          loadPlayer();
        });
    } else {
      token = savedToken;
    }
  } catch (e) {}

  syncAuthUI();
  if (token) {
    loadRecent();
    loadPlayer();
  } else {
    setStatus("unpaired");
  }

  // Best-effort screen wake lock while the remote is visible. Browsers only
  // expose this in a secure context (HTTPS or localhost), so plain-HTTP LAN
  // pages simply skip it.
  var wakeLock = null;
  wakeLockPill.hidden = true;
  secureHint.hidden = window.isSecureContext !== false;
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/remote-sw.js", { scope: "/remote" }).catch(function () {});
  }
  function requestWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock
      .request("screen")
      .then(function (lock) {
        wakeLock = lock;
        wakeLockPill.hidden = false;
        lock.addEventListener("release", function () {
          wakeLock = null;
          wakeLockPill.hidden = true;
        });
      })
      .catch(function () {
        wakeLockPill.hidden = true;
      });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !wakeLock) requestWakeLock();
  });
  requestWakeLock();`;
}
