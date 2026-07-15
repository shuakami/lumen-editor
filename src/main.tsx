import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/maple-mono/400.css";
import "@fontsource/maple-mono/400-italic.css";
import "./index.css";
import App from "./App.tsx";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
