import React from "react";
import ReactDOM from "react-dom/client";

// import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import "../index.css";
import Popup from "./Popup";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <Popup />
      {/* <Toaster /> */}
    </ThemeProvider>
  </React.StrictMode>,
);
