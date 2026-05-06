import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../../client/src/index.css";
import "../../client/src/App.css";
import App from "./App.jsx";
import { login, isAuthenticated } from "../../client/src/core/utils/auth";

// ── Standalone MFE Dev Fix ──────────────────────────────────────────────────
// When running the MFE on port 5004 in isolation, localStorage is empty.
// We must initialize a session to allow API calls to succeed.
if (import.meta.env.DEV && !isAuthenticated()) {
  login("admin@abi.com", "admin", { fullName: "MFE Admin" });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
