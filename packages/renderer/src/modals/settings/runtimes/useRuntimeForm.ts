import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RuntimeEntry } from "@f-mark/shared";
import {
  asIcon,
  closedRuntimeForm,
  formatEnv,
  runtimeEntryFromForm,
  type RuntimeFormState,
} from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  add: "add",
  edit: "edit",
  bot: "bot",
  closed: "closed",
} as const;

export interface RuntimeFormController {
  form: RuntimeFormState;
  setForm: Dispatch<SetStateAction<RuntimeFormState>>;
  error: string | null;
  busy: boolean;
  openAdd(): void;
  openEdit(id: string, entry: RuntimeEntry): void;
  cancel(): void;
  submit(): Promise<void>;
}

export function useRuntimeForm({
  onAdd,
  onUpdate,
}: {
  onAdd(id: string, entry: RuntimeEntry): Promise<void>;
  onUpdate(id: string, entry: RuntimeEntry): Promise<void>;
}): RuntimeFormController {
  const [form, setForm] = useState<RuntimeFormState>(() => closedRuntimeForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openAdd(): void {
    setForm({ ...closedRuntimeForm(), mode: NO_LOOSE_STRING_VALUES.add });
    setError(null);
  }

  function openEdit(id: string, entry: RuntimeEntry): void {
    setForm({
      mode: NO_LOOSE_STRING_VALUES.edit,
      editingId: id,
      id,
      displayName: entry.displayName,
      executable: entry.executable,
      argsText: entry.args.join(" "),
      envText: formatEnv(entry.env),
      icon: asIcon(entry.icon ?? NO_LOOSE_STRING_VALUES.bot),
      readyDelayMs: String(entry.readyDelayMs ?? 1500),
    });
    setError(null);
  }

  function cancel(): void {
    setForm(closedRuntimeForm());
    setError(null);
  }

  async function submit(): Promise<void> {
    if (form.mode === NO_LOOSE_STRING_VALUES.closed) return;
    const result = runtimeEntryFromForm(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (form.mode === NO_LOOSE_STRING_VALUES.add) {
        await onAdd(form.id, result.entry);
      } else if (form.editingId !== null) {
        await onUpdate(form.editingId, result.entry);
      }
      setForm(closedRuntimeForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return {
    form,
    setForm,
    error,
    busy,
    openAdd,
    openEdit,
    cancel,
    submit,
  };
}
