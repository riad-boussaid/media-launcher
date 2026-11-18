import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  chapterNext,
  chapterPrev,
  clearPlaybackError,
  clearPlayedPlaylist,
  clearQueue,
  loadMorePlaylist,
  moveQueueItem,
  moveQueueItemTo,
  type PlayerQueueEntry,
  type PlayerStatus,
  playQueueItem,
  removePlaylistFromQueue,
  removeQueueItem,
  seekTo,
  setRepeatMode,
  setSpeed,
  setVolume,
  shuffleQueue,
  skipTrack,
  stopPlayback,
  toggleMute,
  togglePause,
} from "../lib/api";
import { formatTime, hostOf } from "../lib/format";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formattedSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="7.5 4.5 20 12 7.5 19.5" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function SkipSecondsGlyph({ forward }: { forward?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          forward
            ? "M21 12a9 9 0 1 1-2.64-6.36L21 8"
            : "M3 12a9 9 0 1 0 2.64-6.36L3 8"
        }
      />
      <path d={forward ? "M21 3v5h-5" : "M3 3v5h5"} />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </svg>
  );
}

function ChevronGlyph({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function VolumeGlyph({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? (
        <>
          <path d="m22 9-6 6" />
          <path d="m16 9 6 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

function SkipTrackGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="5 5 15 12 5 19" />
      <rect x="17" y="5" width="2.5" height="14" rx="1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function Artwork({
  src,
  className,
  iconSize = 16,
}: {
  src: string;
  className: string;
  iconSize?: number;
}) {
  return (
    <span
      className={`relative shrink-0 overflow-hidden border border-border bg-elevated ${className}`}
    >
      <span className="absolute inset-0 flex items-center justify-center text-muted/70">
        <svg
          viewBox="0 0 24 24"
          width={iconSize}
          height={iconSize}
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon points="7 4 21 12 7 20 7 4" />
        </svg>
      </span>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : null}
    </span>
  );
}

function CaretGlyph({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}

function RemoveGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PlaylistGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h10M3 12h7M3 18h7" />
      <polygon points="15 10 21 13 15 16" fill="currentColor" stroke="none" />
    </svg>
  );
}

function QueueGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h11M3 12h8M3 18h8" />
      <path d="M18 12v8M14 16h8" />
    </svg>
  );
}

function DisclosureGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={open ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

function MenuGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function ShuffleGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

function RepeatGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function GripGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="6" r="1.3" />
      <circle cx="16" cy="6" r="1.3" />
      <circle cx="8" cy="12" r="1.3" />
      <circle cx="16" cy="12" r="1.3" />
      <circle cx="8" cy="18" r="1.3" />
      <circle cx="16" cy="18" r="1.3" />
    </svg>
  );
}

interface NowPlayingProps {
  player: PlayerStatus;
  onRefresh: () => void;
}
export default function NowPlaying({ player, onRefresh }: NowPlayingProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [confirmClearQueue, setConfirmClearQueue] = useState(false);
  const [expandedPlayed, setExpandedPlayed] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [groupMenuKey, setGroupMenuKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);

  const duration = Number.isFinite(player.duration)
    ? Math.max(0, player.duration)
    : 0;
  const disabled = !player.ipcReady;
  const hasChapters = player.chapters.length > 0;
  const errorLabel = player.error
    ? player.error.title ||
      (player.error.playlistIndex !== null
        ? `Track ${player.error.playlistIndex}${
            player.error.playlistTitle
              ? ` of ${player.error.playlistTitle}`
              : ""
          }`
        : hostOf(player.error.url))
    : "";
  const errorUrl = player.error?.url;
  const errorEntry = errorUrl
    ? [...player.past, ...player.queue].find((entry) => entry.url === errorUrl)
    : undefined;
  const chapter =
    player.chapter !== null ? player.chapters[player.chapter] : undefined;

  const position =
    scrub !== null
      ? scrub * duration
      : Math.min(duration, Math.max(0, player.position));
  const ratio = duration > 0 ? position / duration : 0;

  const queueGroups = useMemo(() => {
    const groups: {
      key: string;
      playlistId: string | null;
      title: string;
      startVisibleIndex: number;
      entries: {
        item: PlayerQueueEntry;
        played: boolean;
        visibleIndex: number;
      }[];
    }[] = [];
    const entries = [
      ...player.past.map((item) => ({
        item,
        played: true,
        visibleIndex: -1,
      })),
      ...player.queue.map((item, visibleIndex) => ({
        item,
        played: false,
        visibleIndex,
      })),
    ];
    for (const entry of entries) {
      const playlistId =
        entry.item.source === "playlist"
          ? (entry.item.playlistId ?? "playlist")
          : null;
      const last = groups[groups.length - 1];
      if (last && last.playlistId === playlistId) {
        last.entries.push(entry);
      } else {
        // Keys must survive tracks advancing and queue edits, otherwise a
        // collapsed group or an expanded played list snaps shut on every
        // change. Playlist position is stable; manual groups key off the URL.
        groups.push({
          key: playlistId
            ? `playlist:${playlistId}:${entry.item.playlistIndex ?? entry.item.index}`
            : `queue:${entry.item.url}`,
          playlistId,
          title: entry.item.playlistTitle ?? "Playlist",
          startVisibleIndex: entry.visibleIndex,
          entries: [entry],
        });
      }
    }
    return groups;
  }, [player.past, player.queue]);

  const currentPlaylistHasMore =
    player.source === "playlist" &&
    Boolean(player.playlistUrl) &&
    Boolean(player.playlistId) &&
    player.playlistIndex !== null &&
    player.playlistTotal !== null &&
    player.playlistIndex < player.playlistTotal;
  const currentPlaylistGrouped = queueGroups.some(
    (group) => group.playlistId === player.playlistId,
  );
  const showCurrentPlaylistMore =
    currentPlaylistHasMore && !currentPlaylistGrouped;
  const currentPlaylistLoad =
    showCurrentPlaylistMore && player.playlistUrl && player.playlistId
      ? { url: player.playlistUrl, id: player.playlistId }
      : null;

  // Close the speed menu on outside click or Escape.
  useEffect(() => {
    if (!speedOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (
        speedRef.current &&
        !speedRef.current.contains(event.target as Node)
      ) {
        setSpeedOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSpeedOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [speedOpen]);

  useEffect(() => {
    if (player.queue.length === 0) setConfirmClearQueue(false);
  }, [player.queue.length]);

  const run = (action: Promise<boolean>, failMessage?: string) => {
    void action
      .then((ok) => {
        if (!ok && failMessage) setActionError(failMessage);
        onRefresh();
      })
      .catch(() => {
        if (failMessage) setActionError(failMessage);
        onRefresh();
      });
  };

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 4500);
    return () => clearTimeout(timer);
  }, [actionError]);

  const cycleRepeat = () => {
    const next =
      player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    run(setRepeatMode(next), "Could not change the repeat mode.");
  };

  const dropOn = (target: number) => {
    if (dragIndex === null || dragIndex === target) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    run(moveQueueItemTo(dragIndex, target), "Could not move that queue item.");
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const queueActionClass =
    "w-6 h-6 flex items-center justify-center rounded border-none bg-transparent text-muted cursor-pointer transition-colors hover:bg-elevated disabled:opacity-30 disabled:cursor-default";

  const togglePlayed = (key: string) => {
    setExpandedPlayed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const ratioAt = (clientX: number): number => {
    const el = seekRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const startScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrub(ratioAt(event.clientX));
  };

  const moveScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    setScrub(ratioAt(event.clientX));
  };

  const commitScrub = (event: PointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    const next = ratioAt(event.clientX);
    setScrub(next);
    void seekTo(next * duration)
      .catch(() => {})
      .finally(() => {
        setScrub(null);
        onRefresh();
      });
  };

  const onSeekKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    let target: number | null = null;
    if (event.key === "ArrowLeft") target = Math.max(0, position - 5);
    else if (event.key === "ArrowRight")
      target = Math.min(duration, position + 5);
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = duration;
    if (target === null) return;
    event.preventDefault();
    run(seekTo(target));
  };

  return (
    <section className="player-card p-4" aria-label="Now playing">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Artwork
            src={player.thumbnail}
            className="w-20 h-[45px] rounded-lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`player-eq ${player.paused ? "paused" : ""}`}
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
                <span />
              </span>
              <span className="text-[10.5px] text-muted uppercase tracking-[0.09em] font-semibold">
                Now playing
              </span>
              {player.source === "playlist" && (
                <span
                  className="flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-accent"
                  title={
                    player.playlistTitle
                      ? `From ${player.playlistTitle}`
                      : "Playlist"
                  }
                >
                  <PlaylistGlyph />
                  Playlist
                </span>
              )}
            </div>
            <h3
              className="text-[14px] leading-snug font-semibold text-text m-0 line-clamp-2"
              title={player.title || player.url || undefined}
            >
              {player.title || hostOf(player.url ?? "")}
            </h3>
            <div className="mt-1 text-[11.5px] text-muted truncate">
              {hostOf(player.url ?? "")}
              {player.chapter !== null && chapter && (
                <>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span className="text-text-dim">
                    Chapter {player.chapter + 1}/{player.chapters.length}
                    {chapter.title ? ` — ${chapter.title}` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-transparent text-muted cursor-pointer transition-colors hover:text-danger hover:bg-danger/10"
          title="Stop playback"
          aria-label="Stop playback"
          onClick={() => run(stopPlayback())}
        >
          <StopGlyph />
        </button>
      </div>

      {actionError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2">
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-warning">
            {actionError}
          </span>
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-warning cursor-pointer transition-colors hover:bg-warning/15"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {player.error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2">
          <span
            className="min-w-0 flex-1 truncate text-[11px] leading-snug text-danger"
            title={`${player.error.message} — ${player.error.url}`}
          >
            Couldn't play “{errorLabel}”
          </span>
          {errorEntry && (
            <button
              type="button"
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-accent cursor-pointer transition-colors hover:bg-accent/10"
              onClick={() => {
                void (async () => {
                  if (await playQueueItem(errorEntry.index)) {
                    await clearPlaybackError();
                  }
                  onRefresh();
                })().catch(() => {});
              }}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-danger cursor-pointer transition-colors hover:bg-danger/15"
            onClick={() => run(clearPlaybackError())}
          >
            Dismiss
          </button>
        </div>
      )}

      {duration > 0 && (
        <div className="mt-3.5">
          <div
            ref={seekRef}
            className="seek"
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
            aria-disabled={disabled || undefined}
            data-scrubbing={scrub !== null}
            onPointerDown={startScrub}
            onPointerMove={moveScrub}
            onPointerUp={commitScrub}
            onPointerCancel={() => setScrub(null)}
            onKeyDown={onSeekKeyDown}
          >
            <div className="seek-track">
              <div className="seek-fill" style={{ width: `${ratio * 100}%` }} />
              {hasChapters &&
                player.chapters.map((item, index) =>
                  item.time > 0 && item.time < duration ? (
                    <span
                      key={`${item.time}-${index}`}
                      className="seek-tick"
                      style={{ left: `${(item.time / duration) * 100}%` }}
                    />
                  ) : null,
                )}
              <span className="seek-knob" style={{ left: `${ratio * 100}%` }} />
            </div>
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-muted font-medium tabular-nums">
            <span>{formatTime(position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 mt-1">
        <button
          type="button"
          className="player-btn"
          title="Back 10 seconds"
          aria-label="Back 10 seconds"
          disabled={disabled || player.position <= 0}
          onClick={() => run(seekTo(Math.max(0, player.position - 10)))}
        >
          <SkipSecondsGlyph />
        </button>
        {hasChapters && (
          <button
            type="button"
            className="player-btn"
            title="Previous chapter"
            aria-label="Previous chapter"
            disabled={
              disabled || player.chapter === null || player.chapter <= 0
            }
            onClick={() => run(chapterPrev())}
          >
            <ChevronGlyph direction="left" />
          </button>
        )}
        <button
          type="button"
          className="player-btn player-btn-primary"
          title={player.paused ? "Resume" : "Pause"}
          aria-label={player.paused ? "Resume" : "Pause"}
          disabled={disabled}
          onClick={() => run(togglePause())}
        >
          {player.paused ? <PlayGlyph /> : <PauseGlyph />}
        </button>
        {hasChapters && (
          <button
            type="button"
            className="player-btn"
            title="Next chapter"
            aria-label="Next chapter"
            disabled={
              disabled ||
              player.chapter === null ||
              player.chapter >= player.chapters.length - 1
            }
            onClick={() => run(chapterNext())}
          >
            <ChevronGlyph direction="right" />
          </button>
        )}
        <button
          type="button"
          className="player-btn"
          title="Forward 10 seconds"
          aria-label="Forward 10 seconds"
          disabled={disabled}
          onClick={() => run(seekTo(player.position + 10))}
        >
          <SkipSecondsGlyph forward />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-2.5 pt-3 border-t border-border">
        <button
          type="button"
          className="player-btn player-btn-sm"
          title={player.muted ? "Unmute" : "Mute"}
          aria-label={player.muted ? "Unmute" : "Mute"}
          disabled={disabled}
          onClick={() => run(toggleMute())}
        >
          <VolumeGlyph muted={player.muted} />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(player.volume)}
          onChange={(event) => run(setVolume(Number(event.target.value)))}
          className="range flex-1"
          style={
            {
              "--range-fill": `${player.volume}%`,
            } as CSSProperties
          }
          aria-label="Volume"
          disabled={disabled}
        />
        <span className="text-[10.5px] text-muted w-7 text-right tabular-nums">
          {Math.round(player.volume)}%
        </span>
        <span className="w-px h-4 bg-border mx-0.5" aria-hidden="true" />
        <button
          type="button"
          className={`player-chip gap-1 ${
            player.repeat === "off" ? "" : "text-accent"
          }`}
          title={
            player.repeat === "off"
              ? "Repeat off — click for repeat all"
              : player.repeat === "all"
                ? "Repeat all — click for repeat one"
                : "Repeat one — click to turn off"
          }
          aria-label={`Repeat ${player.repeat}`}
          disabled={disabled}
          onClick={cycleRepeat}
        >
          <RepeatGlyph />
          {player.repeat === "one" && (
            <span className="text-[9px] font-semibold leading-none">1</span>
          )}
        </button>
        <div className="relative" ref={speedRef}>
          <button
            type="button"
            className="player-chip"
            title="Playback speed"
            aria-haspopup="menu"
            aria-expanded={speedOpen}
            disabled={disabled}
            onClick={() => setSpeedOpen((open) => !open)}
          >
            <span className="tabular-nums">{formattedSpeed(player.speed)}</span>
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {speedOpen && (
            <div
              role="menu"
              aria-label="Playback speed"
              className="absolute bottom-full right-0 mb-2 z-20 w-[92px] p-1 rounded-xl bg-elevated border border-border-strong shadow-[0_12px_32px_rgb(0_0_0_/_0.45)]"
            >
              {SPEEDS.map((speed) => {
                const active = Math.abs(player.speed - speed) < 0.01;
                return (
                  <button
                    key={speed}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 border-none rounded-md bg-transparent text-[12px] cursor-pointer transition-colors hover:bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] hover:text-text ${
                      active
                        ? "text-accent font-semibold"
                        : "text-text-dim font-normal"
                    }`}
                    onClick={() => {
                      setSpeedOpen(false);
                      if (!active) run(setSpeed(speed));
                    }}
                  >
                    <span className="tabular-nums">
                      {formattedSpeed(speed)}
                    </span>
                    {active && <CheckGlyph />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(player.queue.length > 0 ||
        player.past.length > 0 ||
        showCurrentPlaylistMore) && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10.5px] text-muted uppercase tracking-[0.09em] font-semibold">
                Queue{" "}
                <span className="text-text-dim">· {player.queue.length}</span>
              </span>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded border-none bg-transparent text-muted cursor-pointer transition-colors hover:bg-elevated hover:text-text disabled:opacity-30 disabled:cursor-default"
                title="Shuffle upcoming videos"
                aria-label="Shuffle upcoming videos"
                disabled={disabled || player.queue.length < 2}
                onClick={() =>
                  run(shuffleQueue(), "Could not shuffle the queue.")
                }
              >
                <ShuffleGlyph />
              </button>
            </div>
            {player.queue.length > 0 &&
              (confirmClearQueue ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-muted">Clear queue?</span>
                  <button
                    type="button"
                    className="p-0 border-none bg-transparent text-[11.5px] font-medium text-danger cursor-pointer hover:underline"
                    onClick={() => {
                      setConfirmClearQueue(false);
                      run(clearQueue(), "Could not clear the queue.");
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="p-0 border-none bg-transparent text-[11.5px] text-muted cursor-pointer hover:text-text"
                    onClick={() => setConfirmClearQueue(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="p-0 border-none bg-transparent text-[11.5px] text-muted cursor-pointer transition-colors hover:text-danger"
                    title="Remove all queued videos"
                    onClick={() => setConfirmClearQueue(true)}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 p-0 border-none bg-transparent text-[11.5px] text-accent cursor-pointer transition-colors hover:text-accent-hover"
                    title="Skip to next queued video"
                    onClick={() => run(skipTrack())}
                  >
                    Skip
                    <SkipTrackGlyph />
                  </button>
                </div>
              ))}
          </div>
          {currentPlaylistLoad && (
            <div className="flex items-center gap-2 pb-1 text-[10px] text-muted">
              <PlaylistGlyph />
              <span className="min-w-0 flex-1 truncate">
                {player.playlistTitle ?? "Playlist"} · track{" "}
                {player.playlistIndex} of {player.playlistTotal}
              </span>
              <button
                type="button"
                className="shrink-0 p-0 border-none bg-transparent text-[10px] font-medium text-accent cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-default"
                disabled={disabled || loadingMore === "current"}
                onClick={() => {
                  setLoadingMore("current");
                  void loadMorePlaylist(
                    currentPlaylistLoad.url,
                    currentPlaylistLoad.id,
                  )
                    .then((ok) => {
                      if (!ok) {
                        setActionError(
                          "Could not load more — playback may have stopped.",
                        );
                      }
                      onRefresh();
                    })
                    .finally(() => setLoadingMore(null));
                }}
              >
                {loadingMore === "current" ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
          <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto pr-0.5">
            {queueGroups.map((group) => {
              const showHeader =
                Boolean(group.playlistId) || queueGroups.length > 1;
              const playedEntries = group.entries.filter(
                (entry) => entry.played,
              );
              const playlistId = group.playlistId;
              const groupKey = playlistId ?? group.key;
              const playedExpanded = expandedPlayed.has(groupKey);
              const collapsed = playlistId
                ? collapsedGroups.has(groupKey)
                : false;
              const menuOpen = groupMenuKey === group.key;
              const hasUpcoming = group.entries.some((entry) => !entry.played);
              const playlistEntry = group.entries.find(
                (entry) => entry.item.source === "playlist",
              );
              const playlistTotal = playlistEntry?.item.playlistTotal ?? null;
              const playlistUrl = group.entries.find(
                (entry) => entry.item.playlistUrl,
              )?.item.playlistUrl;
              const currentInGroup =
                playlistId &&
                player.source === "playlist" &&
                player.playlistId === playlistId
                  ? 1
                  : 0;
              const loadedIndex = Math.max(
                currentInGroup ? (player.playlistIndex ?? 0) : 0,
                ...group.entries.map((entry) => entry.item.playlistIndex ?? 0),
              );
              const hasMore =
                playlistTotal !== null &&
                loadedIndex > 0 &&
                loadedIndex < playlistTotal;
              const availableCount = group.entries.length + currentInGroup;
              const visibleEntries = collapsed
                ? []
                : playedEntries.length > 0 && !playedExpanded
                  ? group.entries.filter((entry) => !entry.played)
                  : group.entries;
              return (
                <div key={group.key}>
                  {showHeader && (
                    <div className="pt-1 pb-0.5">
                      <div className="flex items-center gap-1.5 text-[10.5px] text-text-dim">
                        {playlistId ? (
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-1.5 border-none bg-transparent p-0 text-left text-[10.5px] text-text-dim cursor-pointer transition-colors hover:text-text"
                            title={
                              collapsed
                                ? `Expand ${group.title}`
                                : `Collapse ${group.title}`
                            }
                            aria-expanded={!collapsed}
                            onClick={() => toggleGroup(groupKey)}
                          >
                            <DisclosureGlyph open={!collapsed} />
                            <PlaylistGlyph />
                            <span className="min-w-0 truncate font-medium">
                              {group.title}
                            </span>
                          </button>
                        ) : (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <QueueGlyph />
                            <span className="truncate font-medium">Queued</span>
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] text-muted">
                          · {group.entries.length}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-0.5">
                          {playedEntries.length > 0 && (
                            <button
                              type="button"
                              className="flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-0.5 text-[10px] text-muted cursor-pointer transition-colors hover:bg-elevated hover:text-text"
                              title={
                                playedExpanded
                                  ? "Hide played tracks"
                                  : "Show played tracks"
                              }
                              aria-expanded={playedExpanded}
                              onClick={() => togglePlayed(groupKey)}
                            >
                              <CheckGlyph />
                              {playedEntries.length}
                              <CaretGlyph
                                direction={playedExpanded ? "up" : "down"}
                              />
                            </button>
                          )}
                          {playlistId &&
                            (hasUpcoming || playedEntries.length > 0) && (
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center rounded border-none bg-transparent text-muted cursor-pointer transition-colors hover:bg-elevated hover:text-text"
                                title="Playlist actions"
                                aria-label="Playlist actions"
                                aria-expanded={menuOpen}
                                onClick={() =>
                                  setGroupMenuKey(menuOpen ? null : group.key)
                                }
                              >
                                <MenuGlyph />
                              </button>
                            )}
                        </span>
                      </div>
                      {playlistTotal !== null &&
                        (hasMore || availableCount < playlistTotal) && (
                          <div className="flex items-center gap-2 pl-5 text-[10px] leading-snug text-muted">
                            <span>
                              {hasMore
                                ? `Showing ${loadedIndex} of ${playlistTotal} tracks`
                                : `${availableCount} of ${playlistTotal} tracks available`}
                            </span>
                            {hasMore && playlistUrl && playlistId && (
                              <button
                                type="button"
                                className="p-0 border-none bg-transparent text-[10px] font-medium text-accent cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-default"
                                disabled={disabled || loadingMore === group.key}
                                onClick={() => {
                                  setLoadingMore(group.key);
                                  void loadMorePlaylist(playlistUrl, playlistId)
                                    .then((ok) => {
                                      if (!ok) {
                                        setActionError(
                                          "Could not load more — playback may have stopped.",
                                        );
                                      }
                                      onRefresh();
                                    })
                                    .finally(() => setLoadingMore(null));
                                }}
                              >
                                {loadingMore === group.key
                                  ? "Loading…"
                                  : "Load more"}
                              </button>
                            )}
                          </div>
                        )}
                      {menuOpen && playlistId && (
                        <div className="flex items-center gap-3 pl-5 pt-0.5 pb-1">
                          {hasUpcoming && (
                            <button
                              type="button"
                              className="p-0 border-none bg-transparent text-[10.5px] text-danger cursor-pointer hover:underline"
                              onClick={() => {
                                setGroupMenuKey(null);
                                run(
                                  removePlaylistFromQueue(playlistId),
                                  "Could not remove that playlist.",
                                );
                              }}
                            >
                              Remove from queue
                            </button>
                          )}
                          {playedEntries.length > 0 && (
                            <button
                              type="button"
                              className="p-0 border-none bg-transparent text-[10.5px] text-muted cursor-pointer hover:text-text hover:underline"
                              onClick={() => {
                                setGroupMenuKey(null);
                                run(
                                  clearPlayedPlaylist(playlistId),
                                  "Could not clear the played tracks.",
                                );
                              }}
                            >
                              Clear played
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <ol className="m-0 p-0 list-none flex flex-col gap-1">
                    {visibleEntries.map(({ item, played, visibleIndex }) => {
                      const label =
                        item.title ||
                        (item.source === "playlist" && item.playlistIndex
                          ? `Track ${item.playlistIndex}`
                          : hostOf(item.url));
                      return (
                        <li
                          key={item.index}
                          draggable={!played && !disabled}
                          onDragStart={(event) => {
                            if (played || disabled) return;
                            setDragIndex(item.index);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/plain",
                              String(item.index),
                            );
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragOver={(event) => {
                            if (
                              dragIndex === null ||
                              played ||
                              dragIndex === item.index
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDragOverIndex(item.index);
                          }}
                          onDrop={(event) => {
                            if (played) return;
                            event.preventDefault();
                            dropOn(item.index);
                          }}
                          className={`group flex min-h-[22px] items-center gap-1.5 transition-opacity ${
                            played ? "opacity-55 hover:opacity-100" : ""
                          } ${
                            dragIndex === item.index
                              ? "opacity-40"
                              : dragOverIndex === item.index
                                ? "rounded bg-accent/5 outline outline-1 outline-accent/50"
                                : ""
                          }`}
                        >
                          {!played && (
                            <span
                              className="w-2 flex-none cursor-grab text-muted/40 active:cursor-grabbing"
                              title="Drag to reorder"
                              aria-hidden="true"
                            >
                              <GripGlyph />
                            </span>
                          )}
                          <button
                            type="button"
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border-none bg-transparent p-0 text-left text-[12px] cursor-pointer transition-colors hover:text-text disabled:opacity-60 disabled:cursor-default ${
                              played ? "text-muted" : "text-text-dim"
                            }`}
                            title={
                              played
                                ? "Play this playlist video again"
                                : "Play this queued video"
                            }
                            aria-label={`Play ${label}${played ? " again" : ""}`}
                            disabled={disabled}
                            onClick={() => run(playQueueItem(item.index))}
                          >
                            {played ? (
                              <span className="w-3 shrink-0 flex justify-center text-accent/60">
                                <CheckGlyph />
                              </span>
                            ) : (
                              <span className="text-muted tabular-nums w-3 shrink-0 text-right">
                                {group.playlistId
                                  ? (item.playlistIndex ?? visibleIndex + 1)
                                  : visibleIndex - group.startVisibleIndex + 1}
                              </span>
                            )}
                            <Artwork
                              src={item.thumbnail}
                              className="w-9 h-5 rounded"
                              iconSize={10}
                            />
                            <span className="truncate">{label}</span>
                          </button>
                          {!played && (
                            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              <button
                                type="button"
                                className={`${queueActionClass} hover:text-text`}
                                title="Move up"
                                aria-label={`Move ${label} up`}
                                disabled={disabled || visibleIndex === 0}
                                onClick={() =>
                                  run(
                                    moveQueueItem(item.index, "up"),
                                    "Could not move that queue item.",
                                  )
                                }
                              >
                                <CaretGlyph direction="up" />
                              </button>
                              <button
                                type="button"
                                className={`${queueActionClass} hover:text-text`}
                                title="Move down"
                                aria-label={`Move ${label} down`}
                                disabled={
                                  disabled ||
                                  visibleIndex === player.queue.length - 1
                                }
                                onClick={() =>
                                  run(
                                    moveQueueItem(item.index, "down"),
                                    "Could not move that queue item.",
                                  )
                                }
                              >
                                <CaretGlyph direction="down" />
                              </button>
                              <button
                                type="button"
                                className={`${queueActionClass} hover:text-danger`}
                                title="Remove from queue"
                                aria-label={`Remove ${label} from queue`}
                                disabled={disabled}
                                onClick={() => run(removeQueueItem(item.index))}
                              >
                                <RemoveGlyph />
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
