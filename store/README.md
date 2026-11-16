# Store assets

Listing copy and artwork for the Chrome Web Store and addons.mozilla.org.

## Layout

```
store/
  chrome/
    listing.md              Chrome listing fields, screenshots, permissions
    privacy-practices.md    Answers for the Chrome privacy practices form
  firefox/
    listing.md              AMO listing fields
    permissions.md          Permission rationale
    reviewer-notes.md       Test steps for AMO reviewers
  assets/                   Generated PNGs (committed)
  templates/                HTML sources for the generated artwork
```

## Assets

| File | Size | Used for |
|---|---|---|
| `assets/icon-128.png` | 128×128 | Chrome Web Store listing icon, AMO listing icon |
| `assets/icon-512.png` | 512×512 | Chrome/AMO listing icon |
| `assets/chrome-promo-440x280.png` | 440×280 | Chrome small promo tile |
| `assets/chrome-marquee-1400x560.png` | 1400×560 | Chrome marquee |
| `assets/screenshot-popup-1280x800.png` | 1280×800 | Chrome screenshot 1 |
| `assets/screenshot-player-1280x800.png` | 1280×800 | Chrome screenshot 2 |
| `assets/screenshot-options-1280x800.png` | 1280×800 | Chrome screenshot 3 |
| `assets/firefox-screenshot-1280x800.png` | 1280×800 | AMO screenshot |

## Regenerating artwork

The PNGs are rendered from the HTML templates with headless Chrome or Edge:

```bash
node scripts/generate-store-assets.mjs
```

Set `CHROME_PATH` to the browser executable if it is not in a standard
location. The script uses a 1× device scale factor and fixed viewport sizes, so
the output dimensions match the table above.

The artwork is committed because the store submissions do not need Node or a
browser. Regenerate it only when the listing copy or visual design changes.
