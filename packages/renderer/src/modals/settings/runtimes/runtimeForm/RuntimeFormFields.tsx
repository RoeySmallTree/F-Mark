import type { JSX } from "react";
import type { RuntimeFormController } from "../useRuntimeForm.js";
import { RuntimeEnvField } from "./RuntimeEnvField.js";
import { RuntimeIconField } from "./RuntimeIconField.js";
import { RuntimeTextField } from "./RuntimeTextField.js";

const NO_LOOSE_STRING_VALUES = {
  edit: "edit",
  executable: "Executable",
  args: "Args",
  readydelayms: "readyDelayMs",
  numeric: "numeric",
} as const;

export function RuntimeFormFields({
  controller,
}: {
  controller: RuntimeFormController;
}): JSX.Element {
  const { form, setForm } = controller;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <RuntimeTextField
        label="Runtime id"
        value={form.id}
        onChange={(id) => setForm((f) => ({ ...f, id }))}
        placeholder="mybot"
        ariaLabel="Runtime id"
        disabled={form.mode === NO_LOOSE_STRING_VALUES.edit}
      />
      <RuntimeTextField
        label="Display name"
        value={form.displayName}
        onChange={(displayName) => setForm((f) => ({ ...f, displayName }))}
        placeholder="My Bot"
        ariaLabel="Display name"
      />
      <RuntimeTextField
        label="Executable"
        value={form.executable}
        onChange={(executable) => setForm((f) => ({ ...f, executable }))}
        placeholder="claude"
        ariaLabel={NO_LOOSE_STRING_VALUES.executable}
      />
      <RuntimeTextField
        label="Args (space-separated)"
        value={form.argsText}
        onChange={(argsText) => setForm((f) => ({ ...f, argsText }))}
        placeholder="--flag value"
        ariaLabel={NO_LOOSE_STRING_VALUES.args}
      />
      <RuntimeEnvField
        value={form.envText}
        onChange={(envText) => setForm((f) => ({ ...f, envText }))}
      />
      <RuntimeIconField
        value={form.icon}
        onChange={(icon) => setForm((f) => ({ ...f, icon }))}
      />
      <RuntimeTextField
        label="readyDelayMs"
        value={form.readyDelayMs}
        onChange={(readyDelayMs) => setForm((f) => ({ ...f, readyDelayMs }))}
        ariaLabel={NO_LOOSE_STRING_VALUES.readydelayms}
        inputMode={NO_LOOSE_STRING_VALUES.numeric}
      />
    </div>
  );
}
