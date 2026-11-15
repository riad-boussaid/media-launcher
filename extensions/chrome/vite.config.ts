import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared/src"),
    },
  },
  plugins: [
    react(),
    crx({
      manifest,
      // Build the content script as a self-contained IIFE instead of crxjs's
      // loader + dynamic import(): recent Chrome versions refuse dynamic
      // imports of extension resources from content scripts ("Unsafe attempt
      // to load URL") even when the chunk is in web_accessible_resources.
      contentScripts: {
        standaloneFiles: ["src/content/content.ts"],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        options: resolve(__dirname, "options.html"),
        sidebar: resolve(__dirname, "sidebar.html"),
      },
    },
  },
});
