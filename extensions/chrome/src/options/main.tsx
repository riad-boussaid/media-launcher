import React from "react";
import ReactDOM from "react-dom/client";

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import "../index.css";
import Options from "./Options";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <Options />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
);
