import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/style.css";
import "./styles/theme.css";
import { App } from "./App.jsx";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
