/* FolderStep — pick the first session's project folder (with favoriting, via
   the shared FolderPicker in footerless mode). The picker reports its current
   directory live through onPickFolder; the wizard's own Back/Next footer
   drives navigation, so the picker shows no buttons of its own. The picked
   folder is the project root; session data is stored in that project's
   `.f-mark/sessions` directory. The session itself opens with the placeholder
   name (`new-session`) — the spawned agent renames it once it knows the topic. */

import { type JSX } from "react";
import { FolderPicker } from "../newsession/FolderPicker.js";

export interface FolderStepProps {
  folder: string | null;
  onPickFolder(path: string): void;
}

export function FolderStep({
  folder,
  onPickFolder,
}: FolderStepProps): JSX.Element {
  return (
    <div className="ob-folder">
      <div className="form-hint">
        {folder !== null
          ? "The session opens as “new-session” — your agent renames it once it knows what you’re working on."
          : "Pick a project folder below."}
      </div>

      <div className="ob-folder-pick">
        <FolderPicker
          initialPath={folder}
          hideActions
          onPathChange={onPickFolder}
        />
      </div>
    </div>
  );
}
