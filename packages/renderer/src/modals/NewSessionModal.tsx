/* NewSessionModal — v0.5 multi-path. Two fields (Folder + Name). Favorites
   and recent paths surface as clickable presets above the folder field so a
   common folder is a single click. The session is created at the user-chosen
   folder via POST /sessions { slug, path }, where slug is derived from name. */

import { type JSX } from "react";
import { useNewSessionController } from "./newsession/useNewSessionController.js";
import { NewSessionView } from "./newsession/NewSessionView.js";

export function NewSessionModal(): JSX.Element {
  return <NewSessionView controller={useNewSessionController()} />;
}
