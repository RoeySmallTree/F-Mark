import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  saving: "Saving…",
} as const;

interface RuntimeFormActionsProps {
  busy: boolean;
  onCancel(): void;
  onSubmit(): Promise<void>;
}

export function RuntimeFormActions({
  busy,
  onCancel,
  onSubmit,
}: RuntimeFormActionsProps): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        className="btn-solid"
        disabled={busy}
        onClick={() => {
          void onSubmit();
        }}
      >
        {busy ? NO_LOOSE_STRING_VALUES.saving : "Save runtime"}
      </button>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
