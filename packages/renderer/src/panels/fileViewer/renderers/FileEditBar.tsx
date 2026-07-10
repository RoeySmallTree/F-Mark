import { useCallback, useState, type ReactNode } from "react";
import { Copy, Save } from "lucide-react";
import { copyToClipboard } from "../../../render/copy.js";

const NO_LOOSE_STRING_VALUES = {
  saving: "Saving...",
  saved: "Saved",
  copyPath: "Copy file path",
  copiedPath: "Copied file path",
} as const;

export interface FileEditBarProps {
  path: string;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  savedAt: number | null;
  truncated: boolean;
  saveLabel: string;
  autosave: boolean;
  onAutosaveChange(value: boolean): void;
  onSave(): void;
  extraControls?: ReactNode;
}

function saveTitle({
  dirty,
  truncated,
  saveLabel,
}: Pick<FileEditBarProps, "dirty" | "truncated" | "saveLabel">): string {
  if (truncated) return "Cannot save a truncated preview";
  if (dirty) return saveLabel;
  return "No unsaved changes";
}

function statusText({
  dirty,
  saving,
  saveError,
  savedAt,
  autosave,
}: Pick<
  FileEditBarProps,
  "dirty" | "saving" | "saveError" | "savedAt" | "autosave"
>): string {
  if (saveError !== null) return `Save failed: ${saveError}`;
  if (saving) return NO_LOOSE_STRING_VALUES.saving;
  if (dirty) return autosave ? "Saving soon…" : "Unsaved changes";
  if (savedAt !== null) return NO_LOOSE_STRING_VALUES.saved;
  return "";
}

export function FileEditBar({
  path,
  dirty,
  saving,
  saveError,
  savedAt,
  truncated,
  saveLabel,
  autosave,
  onAutosaveChange,
  onSave,
  extraControls,
}: FileEditBarProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const status = statusText({ dirty, saving, saveError, savedAt, autosave });
  const copyLabel = copied
    ? NO_LOOSE_STRING_VALUES.copiedPath
    : NO_LOOSE_STRING_VALUES.copyPath;

  const onCopyPath = useCallback((): void => {
    void copyToClipboard(path).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [path]);

  return (
    <div className="fv-editbar">
      <div className="fv-editbar-path">
        <button
          type="button"
          className={`fv-editbar-copy${copied ? " is-copied" : ""}`}
          onClick={onCopyPath}
          aria-label={copyLabel}
          title={copyLabel}
        >
          <Copy size={13} aria-hidden />
        </button>
        <span className="fv-editbar-path-text" title={path}>
          {path}
        </span>
      </div>
      {!autosave ? (
        <button
          type="button"
          className="fv-editbar-save"
          onClick={onSave}
          disabled={!dirty || saving || truncated}
          title={saveTitle({ dirty, truncated, saveLabel })}
          aria-label={saveLabel}
        >
          <Save size={13} aria-hidden />
          <span className="fv-editbar-save-label">Save</span>
        </button>
      ) : null}
      <div className="fv-editbar-end">
        {extraControls}
        {status.length > 0 ? (
          <span
            className={[
              "fv-editbar-status",
              saveError !== null ? "is-error" : null,
              dirty ? "is-dirty" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            role={saveError !== null ? "alert" : "status"}
          >
            {status}
          </span>
        ) : null}
        <label className="settings-toggle fv-editbar-autosave">
          <input
            type="checkbox"
            checked={autosave}
            aria-label="Autosave"
            title="Autosave"
            onChange={(event) => onAutosaveChange(event.currentTarget.checked)}
          />
          <span className="toggle-label">Autosave</span>
        </label>
      </div>
    </div>
  );
}
