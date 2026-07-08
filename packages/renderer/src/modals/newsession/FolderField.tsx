import { type JSX } from "react";
import { FolderClosed, Star } from "lucide-react";
import { basename } from "./pathLabels.js";
import type { NewSessionController } from "./types.js";

interface FolderFieldProps {
  controller: NewSessionController;
}

export function FolderField({ controller }: FolderFieldProps): JSX.Element {
  return (
    <div className="form-row">
      <div className="form-label" style={{ marginBottom: 6 }}>
        FOLDER
      </div>
      <FolderPresets controller={controller} />
      <div className="folder-field">
        <FolderClosed size={14} aria-hidden className="folder-field-icon" />
        <span className="folder-field-path" title={controller.folder ?? ""}>
          {controller.folder ?? "(detecting home…)"}
        </span>
        <button
          type="button"
          className="btn-ghost folder-field-browse"
          onClick={() => controller.setPickerOpen(true)}
        >
          Browse…
        </button>
      </div>
      <div className="form-hint">
        Pick the project root; sessions are stored under .f-mark/sessions.
      </div>
    </div>
  );
}

function FolderPresets({
  controller,
}: FolderFieldProps): JSX.Element | null {
  if (controller.favorites.length === 0 && controller.recentPresets.length === 0) {
    return null;
  }
  return (
    <div className="folder-presets" aria-label="Folder presets">
      {controller.favorites.map((favorite) => (
        <button
          key={`fav-${favorite.path}`}
          type="button"
          className={`folder-preset folder-preset-fav${
            favorite.path === controller.folder ? " on" : ""
          }`}
          title={favorite.path}
          onClick={() => controller.setFolder(favorite.path)}
          aria-pressed={favorite.path === controller.folder}
        >
          <Star size={10} aria-hidden />
          <span className="folder-preset-name">{favorite.name}</span>
        </button>
      ))}
      {controller.recentPresets.map((path) => (
        <button
          key={`recent-${path}`}
          type="button"
          className={`folder-preset${path === controller.folder ? " on" : ""}`}
          title={path}
          onClick={() => controller.setFolder(path)}
          aria-pressed={path === controller.folder}
        >
          <FolderClosed size={10} aria-hidden />
          <span className="folder-preset-name">{basename(path)}</span>
        </button>
      ))}
    </div>
  );
}
