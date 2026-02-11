import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import FileManager from "./FileManager";
import { ToastProvider } from "./components/ToastProvider";
import ToastStack from "./components/ToastStack";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/manager" element={<FileManager />} />
        </Routes>
        <ToastStack />
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
