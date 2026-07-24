import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Wifi, WifiOff, RefreshCw, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { defaultSettings, Settings } from "@/lib/settings";
import { discoverServer } from "@/lib/discovery";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export default function Options() {
  const [serverUrl, setServerUrl] = useState(defaultSettings.serverUrl);
  const [maxHeight, setMaxHeight] = useState<string | null>(
    defaultSettings.maxHeight,
  );
  const [mpvArgs, setMpvArgs] = useState(defaultSettings.mpvArgs);
  const [showThumb, setShowThumb] = useState(defaultSettings.showThumb);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<boolean | null>(null);
  const [dirty, setDirty] = useState(false);

  const runDiscovery = async () => {
    setDiscovering(true);
    setDiscovered(null);
    const result = await discoverServer(serverUrl);
    if (result) {
      setServerUrl(result.serverUrl);
      setDiscovered(true);
    } else {
      setDiscovered(false);
    }
    setDiscovering(false);
  };

  const markDirty = () => setDirty(true);

  const saveOptions = async () => {
    try {
      await chrome.storage.sync.set({
        serverUrl,
        maxHeight,
        mpvArgs,
        showThumb,
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
    setServerUrl(defaultSettings.serverUrl);
    setMaxHeight(defaultSettings.maxHeight);
    setMpvArgs(defaultSettings.mpvArgs);
    setShowThumb(defaultSettings.showThumb);
    setDirty(false);
  };

  const restoreOptions = async () => {
    const opts = (await chrome.storage.sync.get(defaultSettings)) as Settings;
    setServerUrl(opts.serverUrl);
    setMaxHeight(opts.maxHeight);
    setMpvArgs(opts.mpvArgs);
    setShowThumb(opts.showThumb);
  };

  useEffect(() => {
    restoreOptions();
  }, []);

  useEffect(() => {
    if (serverUrl && serverUrl === defaultSettings.serverUrl) {
      runDiscovery();
    }
  }, []);

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
            One per line. Appended after the auto-generated flags.
            <Button variant="link" className="h-auto px-1 text-xs">
              <a
                href="https://mpv.io/manual/stable/#options"
                target="_blank"
                className="flex items-center"
              >
                mpv manual
                <ExternalLink className="ml-1 size-3" />
              </a>
            </Button>
          </p>
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
