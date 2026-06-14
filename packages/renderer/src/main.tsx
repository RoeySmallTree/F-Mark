import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { applyTheme, getCurrentTheme } from "./themes/index.js";
import { applyDensity, getCurrentDensity } from "./themes/density.js";
import { applyPlacement, getCurrentPlacement } from "./themes/layout.js";
import "./styles.css";

// Apply the persisted theme + density + pane arrangement (or defaults) BEFORE
// first render so the initial paint already reflects the user's choice — no
// FOUC. applyPlacement injects the keyed grid rule that `.main` references.
applyTheme(getCurrentTheme());
applyDensity(getCurrentDensity());
applyPlacement(getCurrentPlacement());

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
