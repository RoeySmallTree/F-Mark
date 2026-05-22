/* Phase 6 rewires the compose shell — the real compose bar now lives in
   ../compose/Compose.tsx (mode pills, hotkeys, named title input, target
   pill, send button). This file remains so App.tsx's existing import path
   (shell/Compose) keeps working. */
export { Compose } from "../compose/Compose.js";
