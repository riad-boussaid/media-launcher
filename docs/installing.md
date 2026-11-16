# Installing Media Launcher for free

Media Launcher is MIT-licensed open source. Everything needed to install and
use it is available for free from
[GitHub Releases](https://github.com/riad-boussaid/media-launcher/releases/latest)
and [addons.mozilla.org](https://addons.mozilla.org/firefox/).

Paying for the Chrome Web Store or a code-signing certificate is optional. This
page covers the free paths and the warnings you will see on unsigned builds.

## Download

| Component | File |
|---|---|
| Windows desktop | `Media-Launcher-<version>-win-x64.exe` |
| macOS desktop (Apple Silicon) | `Media-Launcher-<version>-mac-arm64.dmg` |
| macOS desktop (Intel) | `Media-Launcher-<version>-mac-x64.dmg` |
| Linux desktop | `Media-Launcher-<version>-linux-x86_64.AppImage` or `...-linux-amd64.deb` |
| Chrome / Edge / Brave extension | `media-launcher-chrome-<version>.zip` |
| Firefox extension | `media-launcher-firefox-<version>.xpi` |

Every release also includes `SHA256SUMS.txt`. Only download releases from this
repository; do not use third-party repacks.

## Chrome, Edge, and Brave (manual install)

The Chrome Web Store charges a one-time $5 developer registration fee. You do
not need it to use the extension.

1. Download `media-launcher-chrome-<version>.zip` from the latest release.
2. Unzip it into a permanent folder, for example
   `Documents/Media Launcher Extension`. Chrome loads the extension from this
   folder every time it starts, so do not delete it.
3. Open `chrome://extensions`, `edge://extensions`, or `brave://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the folder that contains
   `manifest.json` (the unzipped folder itself, not its parent).
6. Pin **Media Launcher** to the toolbar.

Chrome may warn that developer-mode extensions are enabled each time the
browser starts. That is expected for an unpacked extension; dismiss the warning.

### Updating a manually installed extension

1. Download the new ZIP and unzip it over the **same folder**. Keeping the same
   path preserves the extension ID, API token, and settings.
2. On the extensions page, click **Reload** on Media Launcher.
3. Reopen the popup or options page if it was open.

If you unzip into a new folder instead, Chrome treats it as a different
extension and you will need to paste the API token again.

Edge Add-ons may also list the extension eventually; that store has no
registration fee. If no listing is available, the manual steps above work in
Edge and Brave too.

## Firefox

AMO signing and listing are free.

- **Preferred:** install from the AMO listing once it is approved. It updates
  automatically and is signed by Mozilla.
- **Until the listing is live:** download the XPI, unzip it, and open
  `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select
  `manifest.json`. Temporary add-ons disappear when Firefox restarts.
- A release XPI is only permanently installable in release Firefox if it has
  been signed by AMO or if the release workflow was run with `AMO_API_KEY` and
  `AMO_API_SECRET`. Unsigned XPIs are for temporary testing.

Firefox for Android is not supported: Media Launcher needs the desktop
companion app and uses Firefox's desktop sidebar.

## Windows desktop

1. Download and run `Media-Launcher-<version>-win-x64.exe`.
2. Windows SmartScreen will show **Windows protected your PC** because the
   installer is not signed. Click **More info** → **Run anyway**.
3. The installer lets you choose the installation directory.

The SmartScreen warning disappears only after the project obtains a trusted
code-signing certificate and builds reputation. A certificate is optional; see
[free signing options](#free-signing-options).

Verify a download in PowerShell:

```powershell
Get-FileHash .\Media-Launcher-1.0.0-win-x64.exe -Algorithm SHA256
```

Compare the result with the matching line in `SHA256SUMS.txt`.

## macOS desktop

1. Download the DMG that matches your Mac:
   - Apple Silicon (M1/M2/M3/M4): `...-mac-arm64.dmg`
   - Intel: `...-mac-x64.dmg`
2. Open the DMG and drag **Media Launcher** to **Applications**.
3. The app is unsigned and not notarized, so Gatekeeper will block the first
   launch. Use one of these:
   - Right-click the app → **Open** → **Open**, or
   - **System Settings → Privacy & Security → Open Anyway**, or
   - Remove the quarantine flag:

     ```bash
     sudo xattr -dr com.apple.quarantine "/Applications/Media Launcher.app"
     ```

4. Install mpv and yt-dlp with Homebrew:

   ```bash
   brew install mpv yt-dlp
   ```

   The app also looks in `/opt/homebrew/bin` for Apple Silicon Homebrew.

Verify a download:

```bash
shasum -a 256 Media-Launcher-1.0.0-mac-arm64.dmg
```

There is no free path to Apple notarization. The Apple Developer Program costs
$99/year; fee waivers exist for eligible nonprofits, accredited educational
institutions, and government entities, but not for general open-source
projects. Unsigned builds are the free option.

## Linux desktop

### AppImage

```bash
chmod +x Media-Launcher-1.0.0-linux-x86_64.AppImage
./Media-Launcher-1.0.0-linux-x86_64.AppImage
```

If FUSE is missing on Ubuntu 24.04 or newer:

```bash
sudo apt install libfuse2t64
# older releases: sudo apt install libfuse2
# or run without mounting:
./Media-Launcher-1.0.0-linux-x86_64.AppImage --appimage-extract-and-run
```

### Debian / Ubuntu package

```bash
sudo apt install ./Media-Launcher-1.0.0-linux-amd64.deb
```

Install mpv and yt-dlp from your distribution:

```bash
sudo apt install mpv yt-dlp
```

Linux packages are not code-signed; integrity is covered by
`SHA256SUMS.txt` and GitHub build-provenance attestations.

## First-run setup

The desktop app must be running before the extension can connect.

1. Start Media Launcher.
2. Open **Settings → Connection** and copy the API token.
3. Open the extension options, paste the token, and click **Detect server**.
4. The status should read **Server found**.
5. Open a supported video and use the in-page button, toolbar popup, context
   menu, or keyboard shortcut.

See the main [README](../README.md#first-run-setup) for details.

## Free signing options

### Windows

Two known free programs for open-source projects are:

- **SignPath Foundation** — free code signing for eligible open-source
  projects: <https://signpath.org/>
- **Certum Open Source Code Signing** — free certificate for eligible
  open-source projects; search for “Certum open source code signing”.

Both are third-party programs with their own eligibility rules and review. If
accepted, the signing certificate can be added as `WIN_CSC_LINK` /
`WIN_CSC_KEY_PASSWORD` in the repository secrets and the release workflow will
sign the next version automatically.

### macOS

No free notarization path exists. Apple fee waivers are limited to eligible
nonprofits, schools, and government entities. The free option is to distribute
an unsigned build with the Gatekeeper instructions above.

### Firefox

AMO signs and hosts the extension for free. The optional unlisted signing flow
in the release workflow is also free; it only needs AMO API credentials.

### Chrome

Only the Chrome Web Store registration is paid ($5 one-time). The free options
are manual installation from the release ZIP or, if published, the free Edge
Add-ons store for Edge users.

### Linux

No OS-level signing is required. Checksums and attestations are published with
every release.

## Verifying a release

On macOS/Linux:

```bash
sha256sum -c SHA256SUMS.txt
```

On Windows PowerShell:

```powershell
$expected = (Select-String -Path SHA256SUMS.txt -Pattern "win-x64.exe").Line.Split()[0]
(Get-FileHash .\Media-Launcher-1.0.0-win-x64.exe -Algorithm SHA256).Hash -eq $expected
```

If you have the GitHub CLI, verify the build-provenance attestation:

```bash
gh attestation verify Media-Launcher-1.0.0-win-x64.exe \
  --repo riad-boussaid/media-launcher
```

## Troubleshooting

**Chrome says “Manifest file is missing or unreadable”**

You selected the wrong folder. Select the folder that directly contains
`manifest.json`.

**Chrome disables the extension after a restart**

Chrome shows a developer-mode warning for unpacked extensions. Re-enable it on
`chrome://extensions`; this is normal outside the Web Store.

**Firefox refuses to install the XPI**

Release Firefox only permanently installs signed XPIs. Use the AMO listing when
it is available, or load the extension temporarily through `about:debugging`.

**Windows SmartScreen blocks the installer**

Click **More info → Run anyway**. Verify the SHA-256 checksum first if you want
to confirm the download.

**macOS says the app is damaged or cannot be opened**

Remove the quarantine flag:

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Media Launcher.app"
```

Then open the app from Applications.

**The extension says “Server not found”**

Start the desktop app (or `pnpm -C server dev`), then click **Detect server**.
The extension probes ports 5000–5010.
