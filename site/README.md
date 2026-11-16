# Media Launcher site

Marketing site for Media Launcher, built with [Astro](https://astro.build) and
deployed as a static site on Cloudflare Pages.

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

Create a Cloudflare Pages project connected to this repository:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `site` |
| Framework preset | Astro |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Node version | `24` (`NODE_VERSION=24`) |
| Install command | `pnpm install --frozen-lockfile` |

Optional environment variables:

| Variable | Purpose |
|---|---|
| `SITE_URL` | Canonical origin, e.g. `https://media-launcher.dev`. Falls back to `https://media-launcher.pages.dev`. |
| `NODE_VERSION` | Set to `24`; Astro 7 requires Node 22.23.4+. |
| `PNPM_VERSION` | Optional pin; the project declares pnpm 11.15.1 in `packageManager`. |

Cloudflare builds preview deployments for pull requests automatically. Keep the
build watch path limited to `site/**` if you do not want marketing builds on
unrelated commits.

To attach a custom domain, add it in the Pages project under **Custom domains**
and set `SITE_URL` to the same origin so canonical and Open Graph URLs match.

### Manual deploy

```bash
pnpm -C site build
pnpm dlx wrangler pages deploy site/dist --project-name media-launcher-site
```

`wrangler` needs a Cloudflare API token or an interactive `wrangler login`.
Normal deployments do not need this; the Git integration builds on push.

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
