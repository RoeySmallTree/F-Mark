import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  saving: "Saving…",
} as const;

interface ProfileSaveRowProps {
  dirty: boolean;
  error: string | null;
  onSave(): Promise<void>;
  savedAt: number | null;
  saving: boolean;
}

export function ProfileSaveRow({
  dirty,
  error,
  onSave,
  savedAt,
  saving,
}: ProfileSaveRowProps): JSX.Element {
  return (
    <div
      className="settings-row"
      style={{ borderBottom: 0, paddingBottom: 4 }}
    >
      <div className="settings-l"></div>
      <div
        className="settings-r"
        style={{ display: "flex", gap: 10, alignItems: "center" }}
      >
        <button
          type="button"
          className="btn-solid"
          disabled={!dirty || saving}
          onClick={() => {
            void onSave();
          }}
        >
          {saving ? NO_LOOSE_STRING_VALUES.saving : "Save changes"}
        </button>
        {error !== null ? (
          <span style={{ color: "var(--rose)", fontSize: 12 }}>{error}</span>
        ) : null}
        {error === null && savedAt !== null ? (
          <span style={{ color: "var(--green)", fontSize: 12 }}>Saved.</span>
        ) : null}
      </div>
    </div>
  );
}
