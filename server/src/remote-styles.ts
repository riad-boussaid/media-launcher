export function remoteStyles(): string {
  return `  :root {
    color-scheme: dark;
    --base: #0e1013;
    --surface: #14171c;
    --card: #191d24;
    --elevated: #222833;
    --accent: #64ffda;
    --accent-hover: #48e9c6;
    --on-accent: #0b0d10;
    --text: #e7eaef;
    --text-dim: #b8bfca;
    --muted: #8b929e;
    --label: #9aa3b2;
    --danger: #f87171;
    --success: #34d399;
    --warning: #fbbf24;
    --border: rgb(255 255 255 / 0.08);
    --border-strong: rgb(255 255 255 / 0.16);
    --track: rgb(255 255 255 / 0.07);
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    min-height: 100dvh;
    background:
      radial-gradient(120% 55% at 50% -10%, rgb(100 255 218 / 0.06), transparent 70%),
      var(--base);
    color: var(--text);
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    padding: calc(14px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom));
    max-width: 500px;
    margin-inline: auto;
  }
  button, input { font: inherit; }
  button { cursor: pointer; }
  [hidden] { display: none !important; }
  button:focus-visible, input:focus-visible, .seek:focus-visible {
    outline: 2px solid rgb(100 255 218 / 0.5);
    outline-offset: 2px;
  }

  /* Header */
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
  .brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .brand-mark {
    width: 28px; height: 28px; flex: none; display: grid; place-items: center;
    border-radius: 9px; background: rgb(100 255 218 / 0.12); color: var(--accent);
  }
  .brand-name { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; white-space: nowrap; }
  .status {
    display: inline-flex; align-items: center; gap: 6px; flex: none;
    padding: 5px 10px 5px 8px; border: 1px solid var(--border); border-radius: 999px;
    background: rgb(255 255 255 / 0.03); color: var(--text-dim);
    font-size: 11px; font-weight: 600; white-space: nowrap;
  }
  .dot { width: 7px; height: 7px; border-radius: 99px; background: var(--muted); }
  .dot.on { background: var(--success); box-shadow: 0 0 7px rgb(52 211 153 / 0.8); }
  .dot.paused { background: var(--warning); box-shadow: 0 0 7px rgb(251 191 36 / 0.7); }
  .dot.off { background: var(--danger); box-shadow: 0 0 7px rgb(248 113 113 / 0.8); }
  .wake { color: var(--accent); font-size: 9.5px; font-weight: 600; }
  .wake[hidden] { display: none; }
  .reconnect {
    display: flex; align-items: center; gap: 9px;
    margin-bottom: 14px; padding: 10px 12px;
    border: 1px solid rgb(251 191 36 / 0.35); border-radius: 12px;
    background: rgb(251 191 36 / 0.08); color: var(--warning);
    font-size: 12px; font-weight: 500;
  }
  .reconnect[hidden] { display: none; }

  /* Cards */
  .card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 16px; margin-bottom: 14px;
  }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  .label {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.09em;
    color: var(--label); font-weight: 650;
  }
  .card > .label { display: block; margin-bottom: 9px; }
  .count { font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .hint { margin: 9px 0 0; font-size: 11px; line-height: 1.5; color: var(--muted); }
  .hint strong { color: var(--text-dim); font-weight: 600; }
  .hint.warn { color: var(--danger); }

  /* Playback error */
  .np-error {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 14px; padding: 10px 12px;
    border: 1px solid rgb(248 113 113 / 0.4); border-radius: 12px;
    background: rgb(248 113 113 / 0.08);
    font-size: 12px; line-height: 1.4; color: #fecaca;
  }
  .np-error[hidden] { display: none; }
  .np-error span { flex: 1; min-width: 0; }
  .np-error button {
    flex: none; min-height: 30px; padding: 4px 6px; border: none; background: transparent;
    color: var(--danger); font-size: 11px; font-weight: 700;
  }
  .np-error #np-error-retry { color: var(--accent); }

  /* Toast */
  .banner {
    position: fixed; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom));
    transform: translateX(-50%); z-index: 50;
    width: min(468px, calc(100vw - 32px));
    padding: 11px 14px; border-radius: 12px;
    background: rgb(43 20 24 / 0.97); border: 1px solid rgb(248 113 113 / 0.45);
    color: #fecaca; font-size: 12.5px; font-weight: 500;
    box-shadow: 0 14px 34px rgb(0 0 0 / 0.5);
    -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
    animation: toastIn 0.22s ease-out;
  }
  .banner.ok {
    background: rgb(10 34 27 / 0.97); border-color: rgb(52 211 153 / 0.45);
    color: #a7f3d0;
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  /* Now playing */
  .player {
    position: relative; padding: 16px; margin-bottom: 14px;
    border: 1px solid var(--border); border-radius: 18px;
    background:
      radial-gradient(120% 85% at 0% 0%, rgb(100 255 218 / 0.09), transparent 58%),
      var(--card);
  }
  .np-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .np-art {
    width: 52px; height: 52px; flex: none; border-radius: 10px;
    object-fit: cover; background: var(--surface);
  }
  .np-art[hidden] { display: none; }
  .np-info { min-width: 0; flex: 1; }
  .eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .eyebrow > .eyebrow-label {
    font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase;
    font-weight: 650; color: var(--label);
  }
  .source-pill {
    display: inline-flex; align-items: center; padding: 2px 6px;
    border-radius: 999px; background: rgb(100 255 218 / 0.1);
    color: var(--accent); font-size: 9px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
  .eq i {
    display: block; width: 2.5px; height: 100%; border-radius: 2px;
    background: var(--accent); transform-origin: bottom;
    animation: eqPulse 1.05s ease-in-out infinite;
  }
  .eq i:nth-child(1) { height: 55%; animation-delay: -0.2s; }
  .eq i:nth-child(2) { height: 100%; animation-delay: -0.55s; }
  .eq i:nth-child(3) { height: 70%; animation-delay: -0.85s; }
  .eq i:nth-child(4) { height: 90%; animation-delay: -0.35s; }
  .eq.paused { opacity: 0.55; }
  .eq.paused i { animation: none; transform: scaleY(0.45); }
  @keyframes eqPulse {
    0%, 100% { transform: scaleY(0.35); }
    50% { transform: scaleY(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .eq i { animation: none; }
    .banner { animation: none; }
  }
  .np-title {
    margin: 0; font-size: 16px; line-height: 1.35; font-weight: 650;
    letter-spacing: -0.01em; display: -webkit-box; -webkit-box-orient: vertical;
    -webkit-line-clamp: 2; overflow: hidden;
  }
  .np-meta {
    margin-top: 4px; font-size: 11.5px; color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .icon-btn {
    width: 34px; height: 34px; flex: none; display: grid; place-items: center;
    border: none; border-radius: 10px; background: transparent; color: var(--muted);
    transition: background 0.15s, color 0.15s, opacity 0.15s;
  }
  .icon-btn:active { background: var(--elevated); color: var(--text); }
  .icon-btn.stop:active { background: rgb(248 113 113 / 0.12); color: var(--danger); }
  .icon-btn:disabled { opacity: 0.35; cursor: default; }

  /* Seek */
  .seek {
    position: relative; display: flex; align-items: center;
    height: 28px; margin-top: 14px; cursor: pointer; touch-action: none;
  }
  .seek[aria-disabled="true"] { cursor: default; opacity: 0.55; }
  .seek-track {
    position: relative; width: 100%; height: 5px;
    border-radius: 99px; background: var(--track);
  }
  .seek-fill {
    position: absolute; inset: 0 auto 0 0; z-index: 1; width: 0%;
    border-radius: 99px; background: var(--accent);
  }
  .seek-ticks { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .seek-tick {
    position: absolute; top: 50%; width: 1.5px; height: 9px; margin-left: -0.75px;
    border-radius: 1px; background: #4b515a;
    background: color-mix(in oklab, var(--text) 30%, var(--base));
    opacity: 0.75; transform: translateY(-50%);
  }
  .seek-knob {
    position: absolute; top: 50%; left: 0%; z-index: 2;
    width: 13px; height: 13px; border-radius: 99px; background: var(--accent);
    box-shadow: 0 0 0 4px rgb(100 255 218 / 0.18);
    transform: translate(-50%, -50%); pointer-events: none;
  }
  .seek:focus-visible .seek-track { box-shadow: 0 0 0 3px rgb(100 255 218 / 0.16); }
  .times {
    display: flex; justify-content: space-between; margin-top: 2px;
    font-size: 11px; font-weight: 500; color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* Transport */
  .transport { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 6px; }
  .t-btn {
    width: 44px; height: 44px; flex: none; display: grid; place-items: center;
    border: none; border-radius: 99px; background: transparent; color: var(--text-dim);
    transition: background 0.15s, color 0.15s, opacity 0.15s;
  }
  .t-btn:active { background: var(--elevated); color: var(--text); }
  .t-btn:disabled { opacity: 0.3; cursor: default; }
  .t-btn.primary {
    width: 58px; height: 58px; background: var(--accent); color: var(--on-accent);
    box-shadow: 0 8px 24px rgb(100 255 218 / 0.22);
  }
  .t-btn.primary:active { background: var(--accent-hover); color: var(--on-accent); }

  /* Volume + speed */
  .utils {
    display: flex; align-items: center; gap: 8px;
    margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--border);
  }
  .utils .icon-btn { width: 34px; height: 34px; }
  .range { flex: 1; min-width: 0; height: 28px; margin: 0; background: transparent; appearance: none; -webkit-appearance: none; }
  .range::-webkit-slider-runnable-track {
    height: 4px; border-radius: 99px;
    background: linear-gradient(
      to right,
      var(--accent) var(--fill, 0%),
      var(--track) var(--fill, 0%)
    );
  }
  .range::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 13px; height: 13px; margin-top: -4.5px; border: none; border-radius: 99px;
    background: var(--text); box-shadow: 0 0 0 3px rgb(100 255 218 / 0.2);
  }
  .range::-moz-range-track {
    height: 4px; border-radius: 99px; background: var(--track);
  }
  .range::-moz-range-progress {
    height: 4px; border-radius: 99px; background: var(--accent);
  }
  .range::-moz-range-thumb {
    width: 13px; height: 13px; border: none; border-radius: 99px;
    background: var(--text); box-shadow: 0 0 0 3px rgb(100 255 218 / 0.2);
  }
  .range:disabled { opacity: 0.4; }
  .pct {
    width: 30px; flex: none; text-align: right; font-size: 10.5px;
    color: var(--muted); font-variant-numeric: tabular-nums;
  }
  .divider { width: 1px; height: 18px; flex: none; background: var(--border); margin: 0 2px; }
  .speed-wrap { position: relative; flex: none; }
  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    height: 36px; padding: 0 10px; border: 1px solid var(--border); border-radius: 9px;
    background: transparent; color: var(--text-dim);
    font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .chip:active { background: var(--elevated); border-color: var(--border-strong); }
  .chip.on { color: var(--accent); border-color: rgb(100 255 218 / 0.4); }
  .menu {
    position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 20;
    width: 104px; padding: 4px;
    background: var(--elevated); border: 1px solid var(--border-strong);
    border-radius: 12px; box-shadow: 0 14px 36px rgb(0 0 0 / 0.5);
  }
  .menu button {
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    padding: 9px 9px; border: none; border-radius: 8px; background: transparent;
    color: var(--text-dim); font-size: 12px; font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .menu button:active { background: rgb(100 255 218 / 0.12); }
  .menu button[aria-checked="true"] { color: var(--accent); font-weight: 700; }
  .menu button[aria-checked="true"]::after { content: "✓"; font-size: 11px; }

  /* Queue */
  .queue { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .queue-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .queue-actions { display: flex; align-items: center; gap: 12px; }
  .link-btn {
    display: inline-flex; align-items: center; gap: 5px;
    min-height: 32px; padding: 4px 2px; border: none; background: transparent;
    color: var(--accent); font-size: 11.5px; font-weight: 650;
  }
  .link-btn:active { color: var(--accent-hover); }
  .played-list {
    margin: 0 0 4px; padding: 0; list-style: none;
    display: flex; flex-direction: column; gap: 2px;
    max-height: 132px; overflow-y: auto;
  }
  .played-list[hidden] { display: none; }
  .played-list button {
    display: flex; align-items: center; gap: 8px; width: 100%;
    min-height: 28px; padding: 2px 0; border: none; background: transparent;
    color: var(--muted); font-size: 11.5px; text-align: left;
  }
  .played-list button:active { color: var(--accent); }
  .played-list .check { flex: none; color: var(--accent); opacity: 0.75; font-size: 10px; }
  .played-list .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .played-list .played-clear { margin-top: 2px; }
  .played-list .played-clear button { color: var(--muted); font-size: 10.5px; }
  .played-list .played-clear button:active { color: var(--danger); }
  .queue ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .queue-list { max-height: 296px; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
  .queue .group-head {
    display: flex; align-items: center; gap: 6px; margin: 7px 0 1px;
    color: var(--muted); font-size: 10px; font-weight: 650;
    letter-spacing: 0.07em; text-transform: uppercase;
  }
  .queue .group-head:first-child { margin-top: 1px; }
  .queue .group-head .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .queue .group-head .remove {
    flex: none; padding: 5px 4px; border: none; background: transparent;
    color: var(--muted); font-size: 10px; font-weight: 600; text-transform: none; letter-spacing: 0;
  }
  .queue .group-head .remove:active { color: var(--danger); }
  .queue .group-head .remove:disabled { opacity: 0.35; }
  .queue .group-head .more {
    flex: none; padding: 5px 4px; border: none; background: transparent;
    color: var(--accent); font-size: 10px; font-weight: 600; text-transform: none; letter-spacing: 0;
  }
  .queue-tools { display: flex; align-items: center; gap: 14px; margin: 0 0 6px; }
  .tool-btn {
    border: none; background: none; padding: 3px 0; min-height: 28px;
    color: var(--muted); font-size: 10.5px; font-weight: 650;
  }
  .tool-btn.active { color: var(--accent); }
  .tool-btn:disabled { opacity: 0.4; }
  .load-more-row {
    display: flex; align-items: center; gap: 6px; padding: 2px 0 5px;
    color: var(--muted); font-size: 10.5px;
  }
  .load-more-row .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .load-more-row button {
    flex: none; margin-left: auto; border: none; background: none; padding: 4px;
    color: var(--accent); font-size: 10px; font-weight: 650;
  }
  .queue .q-move {
    width: 24px; height: 30px; flex: none; display: grid; place-items: center;
    padding: 0; border: none; background: transparent; color: var(--muted);
  }
  .queue .q-move:disabled { opacity: 0.25; }
  .queue .q-move:active:not(:disabled) { color: var(--accent); }
  .queue .queue-item { display: flex; align-items: center; gap: 4px; }
  .queue .q-main {
    display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
    padding: 3px 0; border: none; background: transparent;
    color: var(--text-dim); font-size: 12px; line-height: 1.35; text-align: left;
  }
  .queue .q-main:active { color: var(--accent); }
  .queue .q-tag {
    flex: none; padding: 2px 4px; border-radius: 4px;
    font-size: 8.5px; font-weight: 700; line-height: 1; text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .queue .q-tag.live { background: rgb(248 113 113 / 0.15); color: var(--danger); }
  .queue .q-tag.short { background: rgb(232 121 249 / 0.15); color: #e879f9; }
  .queue .q-remove {
    width: 30px; height: 30px; flex: none; display: grid; place-items: center;
    padding: 0; border: none; background: transparent; color: var(--muted);
  }
  .queue .q-remove:active { color: var(--danger); }
  .queue .q-remove:disabled { opacity: 0.25; }
  .queue li {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; line-height: 1.35; color: var(--text-dim);
  }
  .queue .source { display: inline-flex; flex: none; color: var(--accent); }
  .queue .n {
    width: 14px; flex: none; text-align: right;
    color: var(--muted); font-variant-numeric: tabular-nums;
  }
  .queue .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .queue .more { padding-left: 22px; font-size: 11px; color: var(--muted); }

  /* Idle */
  .idle {
    display: flex; align-items: center; gap: 12px;
    padding: 16px; margin-bottom: 14px;
    border: 1px dashed var(--border-strong); border-radius: 16px;
  }
  .idle-icon {
    width: 38px; height: 38px; flex: none; display: grid; place-items: center;
    border-radius: 12px; background: var(--elevated); color: var(--text-dim);
  }
  .idle-title { font-size: 13px; font-weight: 600; color: var(--text-dim); }
  .idle-sub { margin-top: 2px; font-size: 11.5px; color: var(--muted); }

  /* Send */
  #url, #pair-code {
    width: 100%; padding: 13px 14px;
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border); border-radius: 11px;
    font-size: 16px; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  #url::placeholder, #pair-code::placeholder { color: var(--muted); opacity: 0.8; }
  #url:focus, #pair-code:focus {
    border-color: rgb(100 255 218 / 0.5);
    box-shadow: 0 0 0 3px rgb(100 255 218 / 0.1);
  }
  .send-actions, .row { display: flex; gap: 8px; margin-top: 10px; }
  .btn {
    height: 48px; border: none; border-radius: 11px;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    font-size: 14px; font-weight: 650;
    transition: background 0.15s, color 0.15s, opacity 0.15s;
  }
  .btn.primary { flex: 1; background: var(--accent); color: var(--on-accent); }
  .btn.primary:active { background: var(--accent-hover); }
  .btn.secondary {
    flex: 0 0 40%; background: transparent; border: 1px solid var(--border-strong);
    color: var(--text-dim); font-weight: 550;
  }
  .btn.secondary:active { background: var(--elevated); color: var(--text); }
  .btn:disabled { opacity: 0.4; cursor: default; }

  /* Recent */
  #recent, #later { margin: 0 -6px; padding: 0; list-style: none; }
  #recent li + li, #later li + li { border-top: 1px solid var(--border); }
  .recent-row { display: flex; align-items: center; gap: 6px; }
  .recent-main {
    display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0;
    padding: 9px 6px; border: none; border-radius: 10px;
    background: transparent; color: var(--text); text-align: left;
  }
  .recent-main:active { background: var(--elevated); }
  .recent-queue {
    width: 42px; height: 42px; flex: none; display: grid; place-items: center;
    border: 1px solid var(--border); border-radius: 11px;
    background: transparent; color: var(--muted);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .recent-queue:hover, .recent-queue:active {
    background: rgb(100 255 218 / 0.1); color: var(--accent);
    border-color: rgb(100 255 218 / 0.35);
  }
  .later-remove {
    width: 32px; height: 42px; flex: none; display: grid; place-items: center;
    border: none; border-radius: 10px; background: transparent; color: var(--muted);
    transition: background 0.15s, color 0.15s;
  }
  .later-remove:hover, .later-remove:active {
    background: rgb(248 113 113 / 0.1); color: var(--danger);
  }
  .recent-icon {
    width: 34px; height: 34px; flex: none; display: grid; place-items: center;
    border-radius: 10px; background: rgb(100 255 218 / 0.1); color: var(--accent);
    overflow: hidden;
  }
  .recent-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
  .recent-thumb[hidden] { display: none; }
  .recent-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .recent-title {
    font-size: 12.5px; font-weight: 550; line-height: 1.35;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .recent-meta {
    font-size: 10.5px; color: var(--muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .recent-progress {
    display: block; height: 2px; margin-top: 3px;
    border-radius: 999px; background: var(--border); overflow: hidden;
  }
  .recent-progress-fill {
    display: block; height: 100%; background: var(--accent);
  }

  .later-head-right { display: flex; align-items: center; gap: 8px; }
  #later-continue, #later-no-shorts { color: var(--muted); font-weight: 600; }
  #later-continue[aria-pressed="true"], #later-no-shorts[aria-pressed="true"] {
    color: var(--accent);
  }
  .later-empty { padding: 10px 6px; font-size: 12px; color: var(--muted); }

  /* Pair + unpair */
  #unpair-row { margin-top: 4px; }
  #unpair {
    display: block; width: 100%; padding: 13px;
    background: transparent; border: 1px solid rgb(248 113 113 / 0.28);
    border-radius: 11px; color: var(--danger); font-size: 12px; font-weight: 600;
  }
  #unpair:active { background: rgb(248 113 113 / 0.1); }
  #unpair:disabled { opacity: 0.4; }

  @media (max-width: 360px) {
    .brand-name { display: none; }
    .utils { gap: 6px; }
    .pct { width: 28px; }
    .np-title { font-size: 15px; }
  }`;
}
