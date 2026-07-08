import type { JSX } from "react";
import { RuntimeForm } from "./RuntimeForm.js";
import type { RuntimeFormController } from "./useRuntimeForm.js";

const NO_LOOSE_STRING_VALUES = {
  closed: "closed",
} as const;

export function RuntimeEditor({
  readOnly,
  controller,
}: {
  readOnly: boolean;
  controller: RuntimeFormController;
}): JSX.Element | null {
  if (controller.form.mode === NO_LOOSE_STRING_VALUES.closed) {
    if (readOnly) return null;
    return (
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn-solid"
          onClick={controller.openAdd}
        >
          + Add runtime
        </button>
      </div>
    );
  }

  return <RuntimeForm controller={controller} />;
}
