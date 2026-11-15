import React from "react";
import ReactDOM from "react-dom/client";
import {
  applyTheme,
  type Theme,
  ThemeProvider,
} from "@/components/theme-provider";
import "../index.css";
import Popup from "./Popup";

// Paint the saved (or browser-matched) theme before React renders.
applyTheme((localStorage.getItem("vite-ui-theme") as Theme | null) ?? "system");

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <Popup />
    </ThemeProvider>
  </React.StrictMode>,
);
