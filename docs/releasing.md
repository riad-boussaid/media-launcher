# Releasing Media Launcher

This document covers versioning, local packaging, CI release jobs, signing, and
store submission.

## Versioning

The root `package.json` is the single source of truth. `scripts/sync-version.mjs`
propagates its `version` to:

- `server/package.json` and `SERVER_VERSION` in `server/src/version.ts`
- `desktop/package.json`
- `extensions/chrome/package.json` and `extensions/chrome/manifest.json`
- `extensions/firefox/package.json` and `extensions/firefox/manifest.json`

To cut a release:

1. Update `CHANGELOG.md`: move entries from `[Unreleased]` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section.
2. Bump the root version (for example `pnpm version patch --no-git-tag-version`,
   or edit `package.json`).
3. Run `pnpm version:sync`.
4. Run `pnpm check:release` and the verification commands below.
5. Commit, tag, and push:

   ```bash
   git add -A
   git commit -m "release: vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --follow-tags
   ```

Chrome and Firefox require 1–4 dot-separated integers. Pre-release suffixes
(`-rc.1`) are not valid extension versions, so the sync script rejects them.

## Local packaging

### Browser extensions

```bash
pnpm install
pnpm -C extensions/chrome install
pnpm -C extensions/firefox install
pnpm release:extensions
```

This verifies versions and icons, builds both extensions, and writes:

- `artifacts/media-launcher-chrome-X.Y.Z.zip`
- `artifacts/media-launcher-firefox-X.Y.Z.xpi`

Both archives contain `manifest.json` at the root. The Firefox build clears
`dist/` first, so stale chunks and old assets cannot leak into the XPI. Entry
timestamps come from the changelog release date (or `SOURCE_DATE_EPOCH`), so
rebuilding the same tag produces byte-identical archives.

### Desktop app

```bash
pnpm -C server install
pnpm -C desktop install
pnpm -C desktop run dist:win     # Windows NSIS installer
pnpm -C desktop run dist:mac     # macOS DMG + ZIP, x64 and arm64
pnpm -C desktop run dist:linux   # AppImage + deb
```

Artifacts land in `desktop/release/` and are named
`Media-Launcher-X.Y.Z-<os>-<arch>.<ext>`. The embedded API server is staged by
`desktop/scripts/prepare-server.js` and copied into the app bundle by
`desktop/scripts/copy-server.js`; on macOS it goes inside
`Media Launcher.app/Contents/Resources/server` so it is signed and found at
runtime.

A macOS build with no signing credentials is unsigned and will be blocked by
Gatekeeper when downloaded. For local testing, use `pnpm -C desktop run dev`,
or clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/Media Launcher.app"
```

## CI release workflow

`.github/workflows/release.yml` runs on every `v*` tag and can be started
manually with a tag name.

Jobs:

1. **extensions** — verifies versions/metadata, lints, type-checks, builds both
   extensions, packages ZIP/XPI, creates a source archive, and, when AMO
   credentials are present, submits the Firefox build to the listed AMO channel
   with its source archive and changelog release notes. It does not wait for
   AMO review.
2. **desktop** — builds Windows, macOS, and Linux packages on native runners,
   signing when the corresponding secrets are present.
3. **release** — downloads every artifact, writes `SHA256SUMS.txt`, attaches
   build-provenance attestations, extracts release notes from `CHANGELOG.md`,
   and creates the GitHub Release (`--prerelease` for tags containing `-`).

### Signing secrets

All secrets are optional. Without them, the workflow still produces working
unsigned artifacts. The AMO submission is non-blocking: a failure emits a
workflow warning but still publishes the GitHub release.

| Secret | Used for |
|---|---|
| `WIN_CSC_LINK` | Windows Authenticode certificate (base64 PFX or URL) |
| `WIN_CSC_KEY_PASSWORD` | Windows certificate password |
| `MAC_CSC_LINK` | macOS Developer ID Application certificate |
| `MAC_CSC_KEY_PASSWORD` | macOS certificate password |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer team ID |
| `APPLE_API_KEY` | Contents of an App Store Connect `.p8` key (optional alternative to `APPLE_ID`) |
| `APPLE_API_KEY_ID` | App Store Connect key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer UUID |
| `AMO_API_KEY` | addons.mozilla.org API key for the listed Firefox submission |
| `AMO_API_SECRET` | addons.mozilla.org API secret for the listed Firefox submission |

macOS signing uses electron-builder's standard environment variables and
notarization (`mac.notarize: true`). If `APPLE_API_KEY` is provided, the
workflow writes it to a temporary `.p8` file before building. Linux packages
are not code-signed; supply-chain integrity comes from `SHA256SUMS.txt` and
GitHub build-provenance attestations.

### Verifying a release locally

```bash
sha256sum -c SHA256SUMS.txt
gh attestation verify "Media-Launcher-X.Y.Z-win-x64.exe" --repo riad-boussaid/media-launcher
```

## Store submission

The Chrome Web Store registration costs **$5 one-time** and is optional. If you
want a fully free release, skip it and distribute the Chrome ZIP manually; see
[docs/installing.md](installing.md). Firefox AMO is free, and Edge Add-ons has no
registration fee.

Before submitting to either store, enable GitHub Pages for the repository
(Settings → Pages → Source: GitHub Actions) so
`https://riad-boussaid.github.io/media-launcher/privacy-policy.html` resolves.
`pages.yml` publishes `docs/` on pushes to `main`.

### Chrome Web Store (optional, $5 one-time)

1. Upload `artifacts/media-launcher-chrome-X.Y.Z.zip` in the developer console.
2. Use `store/chrome/listing.md` for the name, summary, description, category,
   and screenshot order.
3. Fill in the privacy practices form using `store/chrome/privacy-practices.md`.
4. Set the privacy policy URL:
   `https://riad-boussaid.github.io/media-launcher/privacy-policy.html`.
5. Upload the assets in `store/assets/`:
   - `chrome-promo-440x280.png`
   - `chrome-marquee-1400x560.png`
   - the three `screenshot-*-1280x800.png` images

### Firefox addons.mozilla.org

The release workflow submits the listed Firefox build automatically when
`AMO_API_KEY` and `AMO_API_SECRET` are configured. It uploads a clean source
archive, passes the changelog section as release notes, and skips waiting for
review (`--approval-timeout 0`). Check the Developer Hub for the review status.

To submit manually, upload `artifacts/media-launcher-firefox-X.Y.Z.xpi` and
`artifacts/media-launcher-firefox-X.Y.Z-source.zip` as a listed version.

Use `store/firefox/listing.md`, `store/firefox/permissions.md`, and
`store/firefox/reviewer-notes.md` for the metadata and reviewer notes. Upload
`store/assets/firefox-screenshot-1280x800.png` and the 128/512 icons.

### Regenerating listing artwork

```bash
node scripts/generate-store-assets.mjs
```

The script renders the HTML templates in `store/templates/` with headless
Chrome or Edge. Set `CHROME_PATH` if the browser is not in a standard location.
The generated PNGs are committed, so this is only needed when the copy changes.

## Release checklist

- [ ] `CHANGELOG.md` has a dated section for the version
- [ ] Root version bumped and `pnpm version:sync` run
- [ ] `pnpm check:release` passes
- [ ] `pnpm icons:check` passes
- [ ] `pnpm lint`, `pnpm type-check`, `pnpm build` pass
- [ ] `pnpm release:extensions` produces both archives
- [ ] `pnpm -C desktop run dist:win` (and mac/Linux where available) works
- [ ] AMO credentials configured (or Firefox submission planned manually)
- [ ] Tag pushed; release workflow is green
- [ ] AMO submission appears in the Developer Hub (when automatic)
- [ ] Store listings and privacy policy URL are current
