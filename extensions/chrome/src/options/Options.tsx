import {
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { discoverServer } from "@/lib/discovery";
import { defaultSettings, type Settings } from "@/lib/settings";

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
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<boolean | null>(null);
  const [dirty, setDirty] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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
  });

  const applySettings = (s: Settings) => {
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
  };

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
      markDirty();
      toast.success("Settings imported — review then Save.");
    } catch {
      toast.error("Invalid settings file.");
    }
  };

  const runDiscovery = useCallback(async () => {
    setDiscovering(true);
    setDiscovered(null);
    const result = await discoverServer(serverUrl);
    if (result) {
      setServerUrl(result.serverUrl);
      setDiscovered(true);
      markDirty();
    } else {
      setDiscovered(false);
    }
    setDiscovering(false);
  }, [serverUrl]);

  const markDirty = () => setDirty(true);

  const saveOptions = async () => {
    try {
      const safeSpeed =
        Number.isFinite(speed) && speed >= 0.25 && speed <= 3
          ? speed
          : defaultSettings.speed;
      await chrome.storage.sync.set({
        serverUrl,
        authToken,
        maxHeight: maxHeight ?? defaultSettings.maxHeight,
        codec,
        mpvArgs,
        showThumb,
        volume,
        speed: safeSpeed,
        subLang,
        loop,
      });
      setDirty(false);
      toast.success("Options saved.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save options.");
    }
  };

  const resetOptions = async () => {
    await chrome.storage.sync.set(defaultSettings);
    toast.success("Reset to defaults.");
    applySettings(defaultSettings);
    setDirty(false);
  };

  const restoreOptions = useCallback(async () => {
    const opts = (await chrome.storage.sync.get(defaultSettings)) as Settings;
    applySettings(opts);
  }, []);

  useEffect(() => {
    restoreOptions();
  }, [restoreOptions]);

  const hasAutoDiscovered = useRef(false);

  useEffect(() => {
    if (hasAutoDiscovered.current) return;
    if (serverUrl && serverUrl === defaultSettings.serverUrl) {
      hasAutoDiscovered.current = true;
      runDiscovery();
    }
  }, [serverUrl, runDiscovery]);

  return (
    <div className="mx-auto w-4/5 max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h4 className="pb-2 text-4xl font-semibold">Configure options</h4>
        {dirty && (
          <span className="text-xs text-amber-500">Unsaved changes</span>
        )}
      </div>

      <Section title="Server">
        <Label>Server URL</Label>
        <div className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setDiscovered(null);
                markDirty();
              }}
              placeholder="http://localhost:5000"
            />
            <div className="flex items-center gap-2 text-xs">
              {discovering ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <RefreshCw className="size-3 animate-spin" /> Discovering...
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
              <Button variant="ghost" size="xs" onClick={runDiscovery}>
                <RefreshCw className="size-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The desktop app runs a local server. The extension auto-discovers
              it on ports 5000–5010.
            </p>
          </div>
        </div>
        <Label htmlFor="auth-token">API token</Label>
        <Input
          id="auth-token"
          type="password"
          value={authToken}
          onChange={(e) => {
            setAuthToken(e.target.value);
            markDirty();
          }}
          placeholder="Paste the token from the desktop app"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Copy the API token from the desktop app's Settings page. The server
          rejects unauthenticated requests.
        </p>
      </Section>

      <Section title="Playback">
        <Label>Maximum resolution</Label>
        <Select
          value={maxHeight}
          onValueChange={(value) => {
            setMaxHeight(value);
            markDirty();
          }}
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
            markDirty();
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
            onChange={(e) => {
              setVolume(Number(e.target.value));
              markDirty();
            }}
            className="flex-1"
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
          onChange={(e) => {
            setSpeed(Number(e.target.value));
            markDirty();
          }}
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
          onChange={(e) => {
            setSubLang(e.target.value);
            markDirty();
          }}
        />
        <p className="text-xs text-muted-foreground">
          ISO 639-1 code, e.g. en, fr, es. Empty = default.
        </p>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="loop"
            checked={loop}
            onCheckedChange={(checked) => {
              setLoop(checked === true);
              markDirty();
            }}
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
              onCheckedChange={(checked) => {
                setShowThumb(checked === true);
                markDirty();
              }}
            />
            <Label htmlFor="show-thumb" className="text-sm font-normal">
              Show video thumbnail for audio-only playback
            </Label>
          </div>
        )}
      </Section>

      <Section title="Advanced">
        <div className="grid w-full gap-4">
          <Label htmlFor="mpv-args">Extra MPV arguments</Label>
          <Textarea
            placeholder="--ytdl-format=bestvideo+bestaudio"
            id="mpv-args"
            value={mpvArgs}
            onChange={(e) => {
              setMpvArgs(e.target.value);
              markDirty();
            }}
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

      <Separator />

      <div className="flex items-center justify-between">
        {dirty && (
          <span className="text-xs text-muted-foreground">
            You have unsaved changes
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={resetOptions}>
            Reset
          </Button>
          <Button onClick={saveOptions}>Save</Button>
        </div>
      </div>
    </div>
  );
}
