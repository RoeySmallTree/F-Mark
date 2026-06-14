/* FolderStep — pick the first session's project folder (with favoriting, via
   the shared FolderPicker in footerless mode) and name the session. The picker
   reports its current directory live through onPickFolder; the wizard's own
   Back/Next footer drives navigation, so the picker shows no buttons of its
   own. The picked folder is the project root; the session is created as a
   `<folder>/<slug>` subdirectory. */

import { type JSX } from "react";
import { FolderPicker } from "../newsession/FolderPicker.js";
import { SLUG_RE } from "./types.js";

export interface FolderStepProps {
  folder: string | null;
  slug: string;
  onPickFolder(path: string): void;
  onSlugChange(slug: string): void;
}

export function FolderStep({
  folder,
  slug,
  onPickFolder,
  onSlugChange,
}: FolderStepProps): JSX.Element {
  const slugValid = slug.length === 0 || SLUG_RE.test(slug);

  return (
    <div className="ob-folder">
      <div className="ob-folder-name">
        <label className="form-label" htmlFor="ob-session-slug">
          SESSION NAME
        </label>
        <input
          id="ob-session-slug"
          className="form-input"
          placeholder="first-session"
          value={slug}
          aria-label="Session name"
          onChange={(e) =>
            onSlugChange(
              e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
            )
          }
        />
        {!slugValid ? (
          <div className="form-error" role="alert">
            Lowercase letters, digits, hyphens only.
          </div>
        ) : (
          <div className="form-hint">
            {folder !== null && slug.length > 0
              ? `Creates ${folder}/${slug}`
              : "Pick a folder below; the session is created inside it."}
          </div>
        )}
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
