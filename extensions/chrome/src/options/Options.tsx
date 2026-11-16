import {
  type DiscoveryResult,
  discoverServer,
  EXPECTED_SERVER_API_VERSION,
} from "@shared/discovery";
import { ext } from "@shared/ext";
import {
  defaultSettings,
  getSettings,
  type Settings,
  saveSettings,
} from "@shared/settings";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const MAX_HEIGHTS = ["2160", "1440", "1080", "720", "480", "a"];
const CODECS = ["any", "h264", "vp9", "av1", "h265"];

function isSettingsShape(value: unknown): value is Settings {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.serverUrl === "string" &&
    typeof s.maxHeight === "string" &&
    MAX_HEIGHTS.includes(s.maxHeight) &&
    typeof s.codec === "string" &&
    CODECS.includes(s.codec) &&
    typeof s.mpvArgs === "string" &&
    typeof s.showThumb === "boolean" &&
    typeof s.volume === "number" &&
    s.volume >= 0 &&
    s.volume <= 100 &&
    typeof s.speed === "number" &&
    s.speed >= 0.25 &&
    s.speed <= 3 &&
    typeof s.subLang === "string" &&
    typeof s.loop === "boolean" &&
    (s.showPageButton === undefined || typeof s.showPageButton === "boolean") &&
    (s.showThumbButtons === undefined ||
      typeof s.showThumbButtons === "boolean") &&
    (s.notifications === undefined || typeof s.notifications === "boolean") &&
    (s.authToken === undefined || typeof s.authToken === "string")
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export default function Options() {
  const [serverUrl, setServerUrl] = useState(defaultSettings.serverUrl);
  const [authToken, setAuthToken] = useState(defaultSettings.authToken);
  const [maxHeight, setMaxHeight] = useState<string | null>(
    defaultSettings.maxHeight,
  );
  const [codec, setCodec] = useState<string>(defaultSettings.codec);
  const [mpvArgs, setMpvArgs] = useState(defaultSettings.mpvArgs);
  const [showThumb, setShowThumb] = useState(defaultSettings.showThumb);
  const [volume, setVolume] = useState(defaultSettings.volume);
  const [speed, setSpeed] = useState(defaultSettings.speed);
  const [subLang, setSubLang] = useState(defaultSettings.subLang);
  const [loop, setLoop] = useState(defaultSettings.loop);
  const [showPageButton, setShowPageButton] = useState(
    defaultSettings.showPageButton,
  );
  const [showThumbButtons, setShowThumbButtons] = useState(
    defaultSettings.showThumbButtons,
  );
  const [notifications, setNotifications] = useState(
    defaultSettings.notifications,
  );
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<boolean | null>(null);
  const [serverInfo, setServerInfo] = useState<DiscoveryResult | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const { theme, setTheme } = useTheme();
  const importRef = useRef<HTMLInputElement>(null);

  const loadedRef = useRef(false);
  const lastSavedRef = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySettings = useCallback((s: Settings) => {
    setServerUrl(s.serverUrl);
    setAuthToken(s.authToken ?? defaultSettings.authToken);
    setMaxHeight(s.maxHeight);
    setCodec(s.codec);
    setMpvArgs(s.mpvArgs);
    setShowThumb(s.showThumb);
    setVolume(s.volume);
    setSpeed(s.speed);
    setSubLang(s.subLang);
    setLoop(s.loop);
    setShowPageButton(s.showPageButton ?? defaultSettings.showPageButton);
    setShowThumbButtons(s.showThumbButtons ?? defaultSettings.showThumbButtons);
    setNotifications(s.notifications ?? defaultSettings.notifications);
  }, []);

  const currentSettings = (): Settings => ({
    serverUrl,
    authToken,
    maxHeight: maxHeight ?? defaultSettings.maxHeight,
    codec,
    mpvArgs,
    showThumb,
    volume,
    speed,
    subLang,
    loop,
    showPageButton,
    showThumbButtons,
    notifications,
  });
  const currentRef = useRef(currentSettings);
  currentRef.current = currentSettings;

  // JSON signature of the form values; changing it schedules a save.
  const signature = JSON.stringify(currentRef.current());

  const persist = useCallback(async (s: Settings) => {
    const safeSpeed =
      Number.isFinite(s.speed) && s.speed >= 0.25 && s.speed <= 3
        ? s.speed
        : defaultSettings.speed;
    await saveSettings({ ...s, speed: safeSpeed });
  }, []);

  // Auto-save: any change to the form is debounced straight into extension
  // storage. Non-secret settings go to sync; the API token stays local.
  useEffect(() => {
    if (!loadedRef.current) return;
    if (signature === lastSavedRef.current) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(JSON.parse(signature) as Settings)
        .then(() => {
          lastSavedRef.current = signature;
          setSaveState("saved");
          setTimeout(
            () => setSaveState((s) => (s === "saved" ? "idle" : s)),
            1500,
          );
        })
        .catch(() => {
          setSaveState("idle");
          toast.error("Failed to save options.");
        });
    }, 600);
  }, [signature, persist]);

  // Flush a pending debounced save when the options page closes.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (lastSavedRef.current !== JSON.stringify(currentRef.current())) {
          void persist(currentRef.current()).catch(() => {});
        }
      }
    },
    [persist],
  );

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(currentSettings(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "media-launcher-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Settings exported.");
  };

  const importSettings = async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isSettingsShape(parsed)) {
        throw new Error("invalid shape");
      }
      applySettings(parsed);
      toast.success("Settings imported.");
    } catch {
      toast.error("Invalid settings file.");
    }
  };

  const runDiscovery = useCallback(async () => {
    setDiscovering(true);
    setDiscovered(null);
    setServerInfo(null);
    const result = await discoverServer(serverUrl);
    setServerInfo(result);
    if (result) {
      setServerUrl(result.serverUrl);
      setDiscovered(true);
    } else {
      setDiscovered(false);
    }
    setDiscovering(false);
  }, [serverUrl]);

  const resetOptions = () => {
    void persist(defaultSettings).then(() => {
      lastSavedRef.current = JSON.stringify(defaultSettings);
      toast.success("Reset to defaults.");
    });
    applySettings(defaultSettings);
  };

  const restoreOptions = useCallback(async () => {
    const opts = await getSettings();
    applySettings(opts);
    lastSavedRef.current = JSON.stringify(currentRef.current());
    loadedRef.current = true;
    setSettingsLoaded(true);
  }, [applySettings]);

  useEffect(() => {
    void restoreOptions();
  }, [restoreOptions]);

  const hasAutoDiscovered = useRef(false);

  useEffect(() => {
    if (!settingsLoaded || hasAutoDiscovered.current) return;
    hasAutoDiscovered.current = true;
    void runDiscovery();
  }, [settingsLoaded, runDiscovery]);

  return (
    <div className="mx-auto w-4/5 max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h4 className="pb-2 text-4xl font-semibold">Configure options</h4>
        {saveState !== "idle" && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {saveState === "saving" ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-green-500" /> Saved
              </>
            )}
          </span>
        )}
      </div>

      {settingsLoaded && !authToken.trim() && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h3 className="text-sm font-semibold">First-time setup</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Start the Media Launcher desktop app (or run the API server).
            </li>
            <li>
              Open the app's <strong>Settings → Connection</strong> and copy the
              API token.
            </li>
            <li>Paste the token into the Server section below.</li>
            <li>
              Click <strong>Detect server</strong>. The status should show
              “Server found”.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            The token is stored only on this device — it is never synced.
          </p>
        </div>
      )}

      <Section title="Appearance">
        <Label>Theme</Label>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={theme === t ? "default" : "outline"}
              onClick={() => setTheme(t)}
            >
              {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          "System" follows your browser's light/dark theme. The preference is
          shared by the popup and sidebar.
        </p>
      </Section>

      <Section title="Server">
        <Label>Server URL</Label>
        <div className="flex-1 space-y-1">
          <Input
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setDiscovered(null);
              setServerInfo(null);
            }}
            placeholder="http://localhost:5000"
          />
          <div className="flex items-center gap-2 text-xs">
            {discovering ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Discovering…
              </span>
            ) : discovered === true ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <Wifi className="size-3" /> Server found
              </span>
            ) : discovered === false ? (
              <span className="flex items-center gap-1 text-destructive">
                <WifiOff className="size-3" /> Server not found
              </span>
            ) : null}
            <Button
              variant="outline"
              size="xs"
              className="gap-1"
              disabled={discovering}
              onClick={() => void runDiscovery()}
            >
              <RefreshCw className="size-3" />
              Detect server
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The desktop app runs a local server. The extension auto-discovers it
            on ports 5000–5010.
          </p>
          {serverInfo && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {serverInfo.version
                  ? `Server v${serverInfo.version}`
                  : "Server version unknown"}
                {typeof serverInfo.apiVersion === "number"
                  ? ` · API ${serverInfo.apiVersion}`
                  : ""}
              </span>
              {serverInfo.apiVersion !== EXPECTED_SERVER_API_VERSION && (
                <span className="text-destructive">
                  Unsupported API version — update the extension and desktop
                  app.
                </span>
              )}
            </div>
          )}
        </div>
        <Label htmlFor="auth-token">API token</Label>
        <div className="relative">
          <Input
            id="auth-token"
            type={showToken ? "text" : "password"}
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Paste the token from the desktop app"
            className="pr-9 font-mono"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowToken((v) => !v)}
            title={showToken ? "Hide token" : "Show token"}
          >
            {showToken ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Copy the API token from the desktop app's Settings page. The server
          rejects unauthenticated requests. The token is stored locally and is
          never synced between devices.
        </p>
      </Section>

      <Section title="Playback">
        <Label>Maximum resolution</Label>
        <Select
          value={maxHeight ?? undefined}
          onValueChange={(value) => setMaxHeight(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Maximum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2160">4K</SelectItem>
            <SelectItem value="1440">1440p</SelectItem>
            <SelectItem value="1080">1080p</SelectItem>
            <SelectItem value="720">720p</SelectItem>
            <SelectItem value="480">480p</SelectItem>
            <SelectItem value="a">Audio only</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Limits video quality. "Audio only" skips video entirely.
        </p>

        <Label>Preferred codec</Label>
        <Select
          value={codec}
          onValueChange={(value) => {
            if (value) setCodec(value);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="h264">H.264</SelectItem>
            <SelectItem value="vp9">VP9</SelectItem>
            <SelectItem value="av1">AV1</SelectItem>
            <SelectItem value="h265">H.265</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Prefers this video codec, falling back to the best available if the
          video doesn't offer it.
        </p>

        <Label>Volume</Label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="flex-1 accent-primary cursor-pointer"
          />
          <span className="w-10 text-right text-sm text-muted-foreground">
            {volume}%
          </span>
        </div>

        <Label>Playback speed</Label>
        <Input
          type="number"
          min={0.25}
          max={3}
          step={0.05}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          onBlur={() => {
            const v = Number(speed);
            if (!Number.isFinite(v) || v < 0.25 || v > 3) {
              setSpeed(defaultSettings.speed);
            }
          }}
        />

        <Label>Preferred subtitle language</Label>
        <Input
          placeholder="en"
          value={subLang}
          onChange={(e) => setSubLang(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          ISO 639-1 code, e.g. en, fr, es. Empty = default.
        </p>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="loop"
            checked={loop}
            onCheckedChange={(checked) => setLoop(checked === true)}
          />
          <Label htmlFor="loop" className="text-sm font-normal">
            Loop the video
          </Label>
        </div>

        {maxHeight === "a" && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-thumb"
              checked={showThumb}
              onCheckedChange={(checked) => setShowThumb(checked === true)}
            />
            <Label htmlFor="show-thumb" className="text-sm font-normal">
              Show video thumbnail for audio-only playback
            </Label>
          </div>
        )}
      </Section>

      <Section title="On-page controls">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-page-button"
            checked={showPageButton}
            onCheckedChange={(checked) => setShowPageButton(checked === true)}
          />
          <Label htmlFor="show-page-button" className="text-sm font-normal">
            Show the play button on video pages
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-thumb-buttons"
            checked={showThumbButtons}
            onCheckedChange={(checked) => setShowThumbButtons(checked === true)}
          />
          <Label htmlFor="show-thumb-buttons" className="text-sm font-normal">
            Show play buttons on thumbnails and playlist headers
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="notifications"
            checked={notifications}
            onCheckedChange={(checked) => setNotifications(checked === true)}
          />
          <Label htmlFor="notifications" className="text-sm font-normal">
            Show desktop notifications after sending
          </Label>
          <Button
            variant="outline"
            size="xs"
            className="ml-auto"
            onClick={() => {
              void ext.notifications
                .create({
                  type: "basic",
                  iconUrl: ext.runtime.getURL("play-logo.png"),
                  title: "media-launcher",
                  message: "Notifications are working.",
                })
                .catch(() =>
                  toast.error(
                    "Could not show a notification — check the browser's notification permission for this extension.",
                  ),
                );
            }}
          >
            Test
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Shift-click an in-page play button to queue the video instead of
          playing it immediately.
        </p>
        <p className="text-xs text-muted-foreground">
          Notifications are controlled by the browser. If the test stays silent,
          allow notifications for this extension in your browser's settings.
        </p>
      </Section>

      <Section title="Advanced">
        <div className="grid w-full gap-4">
          <Label htmlFor="mpv-args">Extra MPV arguments</Label>
          <Textarea
            placeholder="--ytdl-format=bestvideo+bestaudio"
            id="mpv-args"
            value={mpvArgs}
            onChange={(e) => setMpvArgs(e.target.value)}
            className="min-h-40"
          />
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="size-3" />
            One per line. Appended after the auto-generated flags. Playlist
            tips: `--playlist-start=3`, `--loop-playlist=inf`.
            <Button variant="link" className="h-auto px-1 text-xs">
              <a
                href="https://mpv.io/manual/stable/#options"
                target="_blank"
                className="flex items-center"
                rel="noopener"
              >
                mpv manual
                <ExternalLink className="ml-1 size-3" />
              </a>
            </Button>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportSettings}>
              <Download className="size-3" />
              Export settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importRef.current?.click()}
            >
              <Upload className="size-3" />
              Import settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={resetOptions}
            >
              Reset to defaults
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importSettings(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
