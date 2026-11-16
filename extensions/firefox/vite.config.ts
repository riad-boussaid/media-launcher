import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@shared": resolve(import.meta.dirname, "../shared/src"),
    },
  },
  plugins: [
    react(),
    webExtension({
      manifest: () => ({
        ...manifest,
        background: {
          scripts: ["src/background/background.ts"],
        },
        content_scripts: [
          {
            matches: ["<all_urls>"],
            js: ["src/content/content.ts"],
          },
        ],
      }),
      additionalInputs: ["src/background/background.ts", "src/content/content.ts"],
    }),
  ],
  build: {
    // vite-plugin-web-extension forces emptyOutDir off unless it is set
    // explicitly; without this, files from previous builds (old logos, chunks)
    // would ship inside the XPI.
    emptyOutDir: true,
  },
});
