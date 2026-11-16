import { defineConfig } from "astro/config";

// Cloudflare Pages serves the static build. Override SITE_URL in the Pages
// project settings when a custom domain is attached so canonical/OG URLs match.
const site = process.env.SITE_URL ?? "https://media-launcher.pages.dev";

export default defineConfig({
  site,
  output: "static",
  compressHTML: true,
  build: {
    inlineStylesheets: "auto",
  },
});
