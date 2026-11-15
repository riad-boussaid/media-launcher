import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import Sidebar from "./Sidebar";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Sidebar />
  </React.StrictMode>,
);
