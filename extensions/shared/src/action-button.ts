// Injected launcher button. Lives in a shadow root so host pages cannot style
// it (and our styles cannot leak into host pages), while still participating
// in the host layout: "inline" slots into a site's action row, "floating" is a
// fixed pill for pages without a known container.

export type ActionButtonVariant = "inline" | "floating" | "badge" | "compact";

export type ActionButtonState = "idle" | "sending" | "sent" | "error";

export interface ActionButtonOptions {
  variant: ActionButtonVariant;
  label: string;
  /** Accessible name when the visible label is abbreviated or collapsed. */
  ariaLabel?: string;
  /** Returns true when the URL reached the player. */
  onActivate: (options: { queue: boolean }) => Promise<boolean>;
}

export interface ActionButton {
  readonly variant: ActionButtonVariant;
  readonly element: HTMLElement;
  setLabel(label: string): void;
  destroy(): void;
}

const IDLE_AFTER_SENT_MS = 2500;
const IDLE_AFTER_ERROR_MS = 6000;

type IconKind = "play" | "check" | "alert";

// Built with createElementNS: some sites (YouTube among them) enforce Trusted
// Types, which blocks innerHTML / DOMParser string-to-DOM sinks.
function createSvgIcon(kind: IconKind): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");

  const addPath = (attrs: Record<string, string>): void => {
    const path = document.createElementNS(ns, "path");
    for (const [name, value] of Object.entries(attrs)) {
      path.setAttribute(name, value);
    }
    svg.append(path);
  };

  if (kind === "play") {
    addPath({
      d: "M5.6 3.2a.6.6 0 0 1 .92-.5l6.4 3.9a.95.95 0 0 1 0 1.6l-6.4 3.9a.6.6 0 0 1-.92-.5V3.2Z",
      fill: "currentColor",
    });
  } else if (kind === "check") {
    addPath({
      d: "m3.4 8.6 3 3 6.2-7.1",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
  } else {
    addPath({
      d: "M8 2.6 14.4 14H1.6L8 2.6Z",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linejoin": "round",
    });
    addPath({
      d: "M8 6.2v3.2M8 11.5h.01",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.6",
      "stroke-linecap": "round",
    });
  }

  return svg;
}

const STATE_LABELS: Record<Exclude<ActionButtonState, "idle">, string> = {
  sending: "Sending…",
  sent: "Sent to player",
  error: "Couldn't send — retry",
};

const BADGE_STATE_LABELS: Record<
  Exclude<ActionButtonState, "idle">,
  string
> = {
  sending: "Sending…",
  sent: "Sent",
  error: "Retry",
};

const STATE_STATUS: Record<ActionButtonState, string> = {
  idle: "",
  sending: "Sending to Media Launcher",
  sent: "Sent to Media Launcher",
  error: "Could not send to Media Launcher. Press to retry.",
};

function createSpinner(): HTMLSpanElement {
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  return spinner;
}

const STYLES = `
  :host {
    all: initial;
  }

  button {
    position: relative;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    max-width: 100%;
    margin: 0;
    padding: 0 14px 0 6px;
    border: 0;
    border-radius: 18px;
    background: #0f766e;
    color: #fff;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.01em;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    -webkit-font-smoothing: antialiased;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 1px 3px rgba(0, 0, 0, 0.28);
    transition:
      background-color 150ms ease,
      box-shadow 150ms ease,
      transform 100ms ease;
  }

  button:hover {
    background: #115e59;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      0 2px 6px rgba(0, 0, 0, 0.32);
  }

  button:active {
    transform: translateY(1px) scale(0.99);
  }

  button:focus-visible {
    outline: 2px solid #5eead4;
    outline-offset: 2px;
  }

  button[data-state="sending"] {
    background: #115e59;
    cursor: progress;
  }

  button[data-state="sent"] {
    background: #047857;
    cursor: default;
  }

  button[data-state="error"] {
    background: #b91c1c;
  }

  button[data-state="error"]:hover {
    background: #991b1b;
  }

  .icon {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
  }

  .icon svg {
    display: block;
    width: 14px;
    height: 14px;
  }

  button[data-state="sent"] .icon,
  button[data-state="error"] .icon {
    animation: ml-pop 220ms ease-out;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: ml-spin 700ms linear infinite;
  }

  .label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  :host([data-variant="floating"]) button {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      0 8px 30px rgba(0, 0, 0, 0.42);
  }

  :host([data-variant="badge"]) button {
    height: 28px;
    padding: 0 4px;
    gap: 0;
    border-radius: 14px;
    font-size: 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    transition:
      background-color 150ms ease,
      box-shadow 150ms ease,
      gap 180ms ease,
      padding 180ms ease,
      transform 100ms ease;
  }

  :host([data-variant="badge"]) .icon {
    width: 20px;
    height: 20px;
    background: transparent;
  }

  :host([data-variant="badge"]) .icon svg {
    width: 12px;
    height: 12px;
  }

  :host([data-variant="badge"]) .label {
    max-width: 0;
    opacity: 0;
    transition:
      max-width 180ms ease,
      opacity 120ms ease;
  }

  :host([data-variant="badge"]:hover) button,
  :host([data-variant="badge"][data-expanded]) button {
    gap: 6px;
    padding: 0 10px 0 4px;
  }

  :host([data-variant="badge"]:hover) .label,
  :host([data-variant="badge"][data-expanded]) .label {
    max-width: 140px;
    opacity: 1;
  }

  @media (prefers-reduced-motion: no-preference) {
    :host([data-variant="floating"]) {
      animation: ml-enter 180ms ease-out;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
    .spinner {
      animation-duration: 1400ms;
    }
  }

  @keyframes ml-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes ml-pop {
    0% {
      transform: scale(0.7);
      opacity: 0.4;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes ml-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// One stylesheet is shared by every injected button (there can be dozens of
// thumbnail badges on a grid page) instead of duplicating CSS per shadow root.
let sharedStyleSheet: CSSStyleSheet | null | undefined;

function getSharedStyleSheet(): CSSStyleSheet | null {
  if (sharedStyleSheet !== undefined) return sharedStyleSheet;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    sharedStyleSheet = sheet;
  } catch {
    sharedStyleSheet = null;
  }
  return sharedStyleSheet;
}

export function createActionButton({
  variant,
  label,
  ariaLabel,
  onActivate,
}: ActionButtonOptions): ActionButton {
  const host = document.createElement("span");
  host.className = "ml-action-button";
  host.dataset.variant = variant;
  host.dataset.state = "idle";

  // Host layout is set inline so host stylesheets do not disturb placement
  // in either variant.
  if (variant === "inline" || variant === "compact") {
    Object.assign(host.style, {
      display: "inline-flex",
      alignItems: "center",
      flex: "0 0 auto",
      marginLeft: "8px",
      lineHeight: "0",
      verticalAlign: "middle",
    });
  } else if (variant === "floating") {
    Object.assign(host.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      display: "block",
      lineHeight: "0",
    });
  } else {
    Object.assign(host.style, {
      position: "absolute",
      zIndex: "10",
      display: "inline-flex",
      lineHeight: "0",
      pointerEvents: "auto",
    });
  }

  const shadow = host.attachShadow({ mode: "open" });
  const sheet = getSharedStyleSheet();
  if (sheet) {
    shadow.adoptedStyleSheets = [sheet];
  } else {
    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.append(style);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.state = "idle";
  button.title = "Shift-click to queue";
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.setAttribute("aria-hidden", "true");

  const labelEl = document.createElement("span");
  labelEl.className = "label";

  const statusEl = document.createElement("span");
  statusEl.className = "status";
  statusEl.setAttribute("role", "status");
  statusEl.setAttribute("aria-live", "polite");

  button.append(icon, labelEl, statusEl);
  shadow.append(button);

  let state: ActionButtonState = "idle";
  let idleLabel = label;
  let resetTimer: number | undefined;
  let destroyed = false;
  let wasQueued = false;
  const stateLabels =
    variant === "badge" || variant === "compact"
      ? BADGE_STATE_LABELS
      : STATE_LABELS;

  function render(): void {
    host.dataset.state = state;
    host.toggleAttribute("data-expanded", state !== "idle");
    button.dataset.state = state;
    button.setAttribute("aria-busy", String(state === "sending"));
    button.setAttribute(
      "aria-disabled",
      String(state === "sending" || state === "sent"),
    );

    if (state === "sending") {
      icon.replaceChildren(createSpinner());
    } else if (state === "sent") {
      icon.replaceChildren(createSvgIcon("check"));
    } else if (state === "error") {
      icon.replaceChildren(createSvgIcon("alert"));
    } else {
      icon.replaceChildren(createSvgIcon("play"));
    }

    const sentLabel = wasQueued ? "Queued" : stateLabels.sent;
    labelEl.textContent =
      state === "idle"
        ? idleLabel
        : state === "sent"
          ? sentLabel
          : stateLabels[state];
    statusEl.textContent =
      state === "sent" && wasQueued
        ? "Added to the media player queue"
        : STATE_STATUS[state];
  }

  function clearResetTimer(): void {
    if (resetTimer !== undefined) {
      window.clearTimeout(resetTimer);
      resetTimer = undefined;
    }
  }

  async function activate(queue: boolean): Promise<void> {
    if (state === "sending" || state === "sent") return;

    clearResetTimer();
    wasQueued = queue;
    state = "sending";
    render();

    let ok = false;
    try {
      ok = await onActivate({ queue });
    } catch {
      ok = false;
    }
    if (destroyed) return;

    state = ok ? "sent" : "error";
    render();

    resetTimer = window.setTimeout(
      () => {
        state = "idle";
        render();
      },
      ok ? IDLE_AFTER_SENT_MS : IDLE_AFTER_ERROR_MS,
    );
  }

  button.addEventListener("click", (event) => {
    void activate(event.shiftKey);
  });

  render();

  return {
    variant,
    element: host,
    setLabel(next: string): void {
      if (next === idleLabel) return;
      idleLabel = next;
      if (state === "idle") render();
    },
    destroy(): void {
      destroyed = true;
      clearResetTimer();
      host.remove();
    },
  };
}
