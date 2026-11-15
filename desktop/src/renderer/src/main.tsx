import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, type Theme, ThemeProvider } from "./theme-provider";

// Paint the saved (or OS-matched) theme before React renders to avoid a flash.
applyTheme((localStorage.getItem("vite-ui-theme") as Theme | null) ?? "system");

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="system">
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
