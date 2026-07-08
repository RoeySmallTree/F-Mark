import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  applyTheme,
  getCurrentTheme,
  startThemeStorageSync,
} from "./themes/index.js";
import {
  applyDensity,
  getCurrentDensity,
  startDensityStorageSync,
} from "./themes/density.js";
import {
  applyPlacement,
  getCurrentPlacement,
  startPlacementStorageSync,
} from "./themes/layout.js";
import { startThemeReporting } from "./themes/report.js";
/* Dock-layout migration. dockLayout imports no store, so it is safe to import
   above the namespace gate alongside the theme modules. */
import { migrateDockLayoutOnce } from "./shell/dockLayout.js";
/* Namespace state lives in its own tiny module (NOT store.ts) so importing it
   here does not pull in / evaluate the shared store. We must set the namespace
   BEFORE any module that imports the store is loaded — the store reads
   localStorage through nsKey() at module-eval time. */
import {
  fileTreeNamespace,
  setStorageNamespace,
} from "./state/storageNamespace.js";
import { installStaleChunkReload } from "./staleChunkReload.js";
import "./styles.css";

// Self-heal stale lazy-chunk imports (e.g. opening the terminal after a
// renderer rebuild) before anything can trigger one. Must run first.
installStaleChunkReload();

// Apply the persisted theme + density + pane arrangement (or defaults) BEFORE
// first render so the initial paint already reflects the user's choice — no
// FOUC. applyPlacement injects the keyed grid rule that `.main` references.
// (These theme modules do NOT import the store, so they are safe to import
// statically above the namespace gate.)
applyTheme(getCurrentTheme());
applyDensity(getCurrentDensity());
applyPlacement(getCurrentPlacement());

// X6 cross-tab sync: live-apply theme/density/pane-arrangement changes made in
// OTHER browser tabs (the `storage` event only fires in non-writing tabs). This
// runs for both the main App and the standalone /file-tree page so every tab's
// appearance stays coherent.
startThemeStorageSync();
startDensityStorageSync();
startPlacementStorageSync();

// Report the applied theme to the kernel so the fmark_get_theme MCP tool can
// hand connected agents an on-brand design document for what's on screen.
startThemeReporting();

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root element");

/* Standalone /file-tree tab (spec §6.1): render a state-isolated FileTreePage
   instead of the full app. The static catch-all already serves the SPA for
   /file-tree/*, so no server route is needed — we branch on pathname here.

   The namespace is set synchronously here (folding in the launch path_id),
   and App/FileTreePage are BOTH dynamic imports so that whichever branch we
   take, the shared store module is only evaluated AFTER the namespace gate. */
const isFileTree =
  typeof window !== "undefined" &&
  window.location.pathname.startsWith("/file-tree");

if (isFileTree) {
  const pathId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("path_id")
      : null;
  setStorageNamespace(fileTreeNamespace(pathId));
  void (async () => {
    const { FileTreePage } = await import("./pages/FileTreePage.js");
    createRoot(root).render(
      <StrictMode>
        <FileTreePage />
      </StrictMode>,
    );
  })();
} else {
  // Upgrade an older stored dock layout (v1) to the current default ONCE, before
  // App reads it — main app only; the standalone /file-tree branch above must not
  // mutate the global dock.
  migrateDockLayoutOnce();
  void (async () => {
    const { App } = await import("./App.js");
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })();
}
