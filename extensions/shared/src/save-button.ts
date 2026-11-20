// Watch Later toggle injected next to the main play button. Kept separate from
// action-button.ts because its state is sticky: "saved" persists until the
// user toggles it off, whereas player sends return to idle after a moment.

export type SaveButtonVariant = "inline" | "floating" | "compact" | "badge";

export interface SaveToggleResult {
  success: boolean;
  /** The resulting saved state reported by the server. */
  saved?: boolean;
}

export interface SaveButtonOptions {
  variant: SaveButtonVariant;
  saved: boolean;
  /** Receives the state currently shown, so callers can act on the target. */
  onToggle: (current: { saved: boolean }) => Promise<SaveToggleResult>;
}

export interface SaveButton {
  readonly variant: SaveButtonVariant;
  readonly element: HTMLElement;
  setSaved(saved: boolean): void;
  destroy(): void;
}

type SaveButtonState = "idle" | "saving" | "error";

const IDLE_AFTER_ERROR_MS = 6000;

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
    padding: 0 12px 0 5px;
    border: 1px solid rgba(94, 234, 212, 0.38);
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.9);
    color: #f0fdfa;
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
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 1px 3px rgba(0, 0, 0, 0.3);
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 100ms ease;
  }

  button:hover {
    background: rgba(15, 23, 42, 0.98);
    border-color: rgba(94, 234, 212, 0.65);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 2px 6px rgba(0, 0, 0, 0.34);
  }

  button:active {
    transform: translateY(1px) scale(0.99);
  }

  button:focus-visible {
    outline: 2px solid #5eead4;
    outline-offset: 2px;
  }

  button[data-saved="true"] {
    background: #047857;
    border-color: transparent;
    color: #fff;
  }

  button[data-saved="true"]:hover {
    background: #065f46;
    border-color: transparent;
  }

  button[data-state="saving"] {
    cursor: progress;
    opacity: 0.85;
  }

  button[data-state="error"] {
    background: #b91c1c;
    border-color: transparent;
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
    background: rgba(255, 255, 255, 0.14);
  }

  button[data-saved="true"] .icon {
    background: rgba(255, 255, 255, 0.2);
  }

  .icon svg {
    display: block;
    width: 14px;
    height: 14px;
  }

  button[data-state="idle"] .icon,
  button[data-state="error"] .icon {
    animation: ml-save-pop 220ms ease-out;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: ml-save-spin 700ms linear infinite;
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
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 8px 30px rgba(0, 0, 0, 0.42);
  }

  :host([data-variant="badge"]) button {
    height: 28px;
    padding: 0 4px;
    gap: 0;
    border-radius: 14px;
    border-color: rgba(255, 255, 255, 0.32);
    background: rgba(15, 23, 42, 0.82);
    font-size: 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease,
      gap 180ms ease,
      padding 180ms ease,
      transform 100ms ease;
  }

  :host([data-variant="badge"]) button:hover {
    border-color: rgba(94, 234, 212, 0.6);
    background: rgba(15, 23, 42, 0.94);
  }

  :host([data-variant="badge"]) button[data-saved="true"] {
    border-color: transparent;
    background: #047857;
  }

  :host([data-variant="badge"]) button[data-saved="true"]:hover {
    border-color: transparent;
    background: #065f46;
  }

  :host([data-variant="badge"]) button[data-state="error"] {
    border-color: transparent;
    background: #b91c1c;
  }

  :host([data-variant="badge"]) button[data-state="error"]:hover {
    border-color: transparent;
    background: #991b1b;
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
      animation: ml-save-enter 180ms ease-out;
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

  @keyframes ml-save-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes ml-save-pop {
    0% {
      transform: scale(0.7);
      opacity: 0.4;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @keyframes ml-save-enter {
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

function createSvgIcon(kind: "bookmark" | "bookmark-filled" | "alert"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");

  if (kind === "bookmark" || kind === "bookmark-filled") {
    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      "M4 2.5h8a.5.5 0 0 1 .5.5v11L8 11l-4.5 3V3a.5.5 0 0 1 .5-.5Z",
    );
    if (kind === "bookmark-filled") {
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linejoin", "round");
    }
    svg.append(path);
    return svg;
  }

  const outline = document.createElementNS(ns, "path");
  outline.setAttribute("d", "M8 2.6 14.4 14H1.6L8 2.6Z");
  outline.setAttribute("fill", "none");
  outline.setAttribute("stroke", "currentColor");
  outline.setAttribute("stroke-width", "1.5");
  outline.setAttribute("stroke-linejoin", "round");
  const mark = document.createElementNS(ns, "path");
  mark.setAttribute("d", "M8 6.2v3.2M8 11.5h.01");
  mark.setAttribute("fill", "none");
  mark.setAttribute("stroke", "currentColor");
  mark.setAttribute("stroke-width", "1.6");
  mark.setAttribute("stroke-linecap", "round");
  svg.append(outline, mark);
  return svg;
}

function createSpinner(): HTMLSpanElement {
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  spinner.setAttribute("aria-hidden", "true");
  return spinner;
}

export function createSaveButton({
  variant,
  saved: initialSaved,
  onToggle,
}: SaveButtonOptions): SaveButton {
  const host = document.createElement("span");
  host.className = "ml-save-button";
  host.dataset.variant = variant;
  host.dataset.state = "idle";

  if (variant === "floating") {
    Object.assign(host.style, {
      position: "fixed",
      // Stack above the floating play button (bottom 16px + 36px + 10px).
      right: "16px",
      bottom: "62px",
      zIndex: "2147483647",
      display: "block",
      lineHeight: "0",
    });
  } else if (variant === "badge") {
    Object.assign(host.style, {
      position: "absolute",
      zIndex: "10",
      display: "inline-flex",
      lineHeight: "0",
      pointerEvents: "auto",
    });
  } else {
    Object.assign(host.style, {
      display: "inline-flex",
      alignItems: "center",
      flex: "0 0 auto",
      marginLeft: "8px",
      lineHeight: "0",
      verticalAlign: "middle",
    });
  }

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.append(style);

  const button = document.createElement("button");
  button.type = "button";

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

  let saved = initialSaved;
  let state: SaveButtonState = "idle";
  let resetTimer: number | undefined;
  let destroyed = false;

  function render(): void {
    host.dataset.state = state;
    host.dataset.saved = String(saved);
    host.toggleAttribute("data-expanded", state !== "idle");
    button.dataset.state = state;
    button.dataset.saved = String(saved);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-busy", String(state === "saving"));
    button.setAttribute("aria-disabled", String(state === "saving"));
    button.setAttribute(
      "aria-label",
      saved ? "Remove from Watch Later" : "Save to Watch Later",
    );
    button.title = saved ? "Remove from Watch Later" : "Save to Watch Later";

    if (state === "saving") {
      icon.replaceChildren(createSpinner());
    } else if (state === "error") {
      icon.replaceChildren(createSvgIcon("alert"));
    } else {
      icon.replaceChildren(
        createSvgIcon(saved ? "bookmark-filled" : "bookmark"),
      );
    }

    labelEl.textContent =
      state === "saving"
        ? "Saving…"
        : state === "error"
          ? "Retry"
          : saved
            ? "Saved"
            : "Save";

    statusEl.textContent =
      state === "saving"
        ? "Updating Watch Later"
        : state === "error"
          ? "Could not update Watch Later. Press to retry."
          : saved
            ? "Saved in Watch Later. Press to remove."
            : "Not in Watch Later. Press to save.";
  }

  function clearResetTimer(): void {
    if (resetTimer !== undefined) {
      window.clearTimeout(resetTimer);
      resetTimer = undefined;
    }
  }

  async function toggle(): Promise<void> {
    if (state === "saving") return;

    clearResetTimer();
    state = "saving";
    render();

    let result: SaveToggleResult = { success: false };
    try {
      result = await onToggle({ saved });
    } catch {
      result = { success: false };
    }
    if (destroyed) return;

    if (result.success) {
      saved = result.saved ?? !saved;
      state = "idle";
      render();
      return;
    }

    state = "error";
    render();
    resetTimer = window.setTimeout(() => {
      state = "idle";
      render();
    }, IDLE_AFTER_ERROR_MS);
  }

  button.addEventListener("click", () => {
    void toggle();
  });

  render();

  return {
    variant,
    element: host,
    setSaved(next: boolean): void {
      if (next === saved) return;
      saved = next;
      if (state !== "saving") render();
    },
    destroy(): void {
      destroyed = true;
      clearResetTimer();
      host.remove();
    },
  };
}
