import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";
import manifest from "./manifest.json";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
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
            matches: ["*://*.youtube.com/*"],
            js: ["src/content/content.ts"],
          },
        ],
      }),
      additionalInputs: ["src/background/background.ts", "src/content/content.ts"],
    }),
  ],
});
