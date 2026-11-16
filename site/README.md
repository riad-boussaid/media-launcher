# Media Launcher site

Marketing site for Media Launcher, built with [Astro](https://astro.build) and
deployed as a static site on Cloudflare Pages.

Live: <https://media-launcher.pages.dev/>

## Local development

```bash
pnpm -C site install
pnpm -C site dev
```

The dev server prints a local URL. Production build:

```bash
pnpm -C site build
pnpm -C site preview
```

Type/component checking:

```bash
pnpm -C site check
```

The build output is `site/dist`.

## Cloudflare Pages

Production deployment uses the **Cloudflare Pages GitHub integration**. The
project is named `media-launcher` and builds from this repository.

| Setting | Value |
|---|---|
| Git provider | GitHub `riad-boussaid/media-launcher` |
| Production branch | `main` |
| Root directory | `site` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `24` (`NODE_VERSION=24`) |

Cloudflare installs dependencies with pnpm from `site/pnpm-lock.yaml`, then runs
the package's `build` script. `npm run build` is only the command runner; Astro
itself is installed by pnpm.

Optional environment variables:

| Variable | Purpose |
|---|---|
| `SITE_URL` | Canonical origin, e.g. `https://media-launcher.dev`. Falls back to `https://media-launcher.pages.dev`. |
| `NODE_VERSION` | Set to `24`; Astro 7 requires Node 22.23.4+. |
| `PNPM_VERSION` | Optional pin; the project declares pnpm 11.15.1 in `packageManager`. |

The integration creates preview deployments for pull requests and deploys
`main` to production. Cloudflare currently watches all paths; consider limiting
the build watch path to `site/**` so unrelated commits do not trigger builds.

To attach a custom domain, add it in the Pages project under **Custom domains**
and set `SITE_URL` to the same origin so canonical and Open Graph URLs match.

### Wrangler direct upload (manual fallback)

Wrangler is installed in `site/devDependencies` and configured in
`site/wrangler.jsonc` (project `media-launcher`, output `dist`). Use this for
local testing or as a manual fallback if the Pages Git integration is down.

```bash
# One-time local login (or export a CLOUDFLARE_API_TOKEN)
pnpm -C site exec wrangler login

# Create the Pages project once if it does not exist
pnpm -C site run cf:project

# Build and upload manually
pnpm -C site run deploy
```

`pnpm -C site run deploy` runs `astro build` and then:

```bash
wrangler pages deploy dist --project-name media-launcher
```

If the `media-launcher` Pages project name changes, update `name` in
`site/wrangler.jsonc` and `--project-name` in `site/package.json`.

For non-interactive use, set:

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with **Account → Cloudflare Pages → Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

There is no GitHub Actions deploy workflow: the `site` CI job only checks and
builds. Cloudflare's Git integration is the single production deployment path;
manual Wrangler uploads override the current production deployment.

## Assets and content

The store artwork is cropped to the product UI so the page's own copy is not
duplicated. The files live in `site/src/assets/images/`:

| Site asset | Source and crop |
|---|---|
| `popup.png` | `store/assets/screenshot-popup-1280x800.png`, `crop=800:740:450:30` |
| `remote.png` | `store/assets/screenshot-player-1280x800.png`, `crop=820:740:420:30` |
| `options.png` | `store/assets/screenshot-options-1280x800.png`, `crop=820:740:420:30` |
| `icon.png` | `store/assets/icon-512.png` |
| `public/og.png` | `store/assets/chrome-marquee-1400x560.png` |

Regenerate the crops when the store artwork changes:

```bash
ffmpeg -i store/assets/screenshot-popup-1280x800.png \
  -vf "crop=800:740:450:30" site/src/assets/images/popup.png
ffmpeg -i store/assets/screenshot-player-1280x800.png \
  -vf "crop=820:740:420:30" site/src/assets/images/remote.png
ffmpeg -i store/assets/screenshot-options-1280x800.png \
  -vf "crop=820:740:420:30" site/src/assets/images/options.png
cp store/assets/icon-512.png site/src/assets/images/icon.png
cp store/assets/chrome-marquee-1400x560.png site/public/og.png
```

Astro optimizes the imported images to WebP at build time.

The site has no analytics, cookies, or third-party scripts. Keep it that way to
stay consistent with the privacy policy.

## Structure

```text
site/
  astro.config.mjs
  wrangler.jsonc
  pnpm-workspace.yaml
  public/
    favicon.svg
    og.png
    robots.txt
    _headers
  src/
    assets/images/
    components/Icon.astro
    layouts/Base.astro
    pages/index.astro
    styles/global.css
```
