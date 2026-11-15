import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import "../index.css";
import Popup from "./Popup";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Popup />
    </ThemeProvider>
  </React.StrictMode>,
);
