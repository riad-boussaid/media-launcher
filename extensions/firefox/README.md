# media-launcher Firefox Extension

Firefox build of the media-launcher extension. It uses Firefox's native sidebar
(`sidebar_action`) instead of Chrome's side panel and the same local API server
as the Chrome build.

## Development

Run from the repository root:

```bash
pnpm install
pnpm -C extensions/firefox install
pnpm dev:firefox
```

## Build

```bash
pnpm build:firefox
```

Output goes to `extensions/firefox/dist/`. The build empties `dist/` first so
stale chunks and assets cannot leak into a release archive.

## Package a release archive

```bash
pnpm package:firefox
```

Writes `artifacts/media-launcher-firefox-<version>.xpi` with `manifest.json` at
the archive root. When `AMO_API_KEY` and `AMO_API_SECRET` are configured, the
release workflow submits the build to the **listed** AMO channel together with
a clean source archive and the changelog release notes. It does not wait for
AMO review.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `extensions/firefox/dist/manifest.json`.

See the repository [README](../../README.md) and
[release guide](../../docs/releasing.md) for store submission.
