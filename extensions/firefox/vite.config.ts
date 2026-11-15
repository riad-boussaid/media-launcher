import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";
import manifest from "./manifest.json";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "../shared/src"),
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
});
