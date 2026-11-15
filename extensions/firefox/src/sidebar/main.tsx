import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import "../index.css";
import Sidebar from "./Sidebar";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Sidebar />
    </ThemeProvider>
  </React.StrictMode>,
);
