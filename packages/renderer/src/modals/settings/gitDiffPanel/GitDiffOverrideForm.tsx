import type { JSX } from "react";

interface GitDiffOverrideFormProps {
  busy: boolean;
  dirty: boolean;
  hasSavedOverride: boolean;
  isNotGit: boolean;
  onClear: () => Promise<void>;
  onOverrideChange: (value: string) => void;
  onSave: () => Promise<void>;
  onValidate: () => Promise<void>;
  override: string;
  trimmedOverride: string;
}

export function GitDiffOverrideForm({
  busy,
  dirty,
  hasSavedOverride,
  isNotGit,
  onClear,
  onOverrideChange,
  onSave,
  onValidate,
  override,
  trimmedOverride,
}: GitDiffOverrideFormProps): JSX.Element {
  return (
    <>
      <label className="git-diff-override">
        <span className="git-diff-label">Base ref override</span>
        <input
          type="text"
          className="form-input"
          placeholder="origin/main"
          value={override}
          spellCheck={false}
          onChange={(e) => onOverrideChange(e.target.value)}
          disabled={busy || isNotGit}
          data-testid="git-diff-override-input"
        />
      </label>

      <div className="git-diff-actions">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || trimmedOverride.length === 0 || isNotGit}
          onClick={() => void onValidate()}
          data-testid="git-diff-validate"
        >
          Validate
        </button>
        <button
          type="button"
          className="btn-solid"
          disabled={busy || !dirty || isNotGit}
          onClick={() => void onSave()}
          data-testid="git-diff-save"
        >
          Save
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !hasSavedOverride}
          onClick={() => void onClear()}
          data-testid="git-diff-clear"
        >
          Clear
        </button>
      </div>
    </>
  );
}
