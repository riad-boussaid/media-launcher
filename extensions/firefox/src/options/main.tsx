import React from "react";
import ReactDOM from "react-dom/client";
import {
  applyTheme,
  type Theme,
  ThemeProvider,
} from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "../index.css";
import Options from "./Options";

// Paint the saved (or browser-matched) theme before React renders.
applyTheme((localStorage.getItem("vite-ui-theme") as Theme | null) ?? "system");

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <Options />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>,
);
