import { useId, useState, type FormEvent, type JSX } from "react";
import type { ChoicesCardModel } from "./types.js";

const buttonCopy = {
  adding: "Adding…",
  add: "Add",
} as const;

interface CustomChoiceInputProps {
  model: ChoicesCardModel;
}

export function CustomChoiceInput({
  model,
}: CustomChoiceInputProps): JSX.Element | null {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  if (!model.payload.multi) return null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await model.pickCustom(trimmed);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="choice-custom-form" onSubmit={(event) => void submit(event)}>
      <div className="choice-custom-shell">
        <label className="choice-custom-label" htmlFor={inputId}>
          Add a custom option
        </label>
        <div className="choice-custom-row">
          <input
            id={inputId}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type another option…"
          />
          <button type="submit" disabled={busy || draft.trim().length === 0}>
            {busy ? buttonCopy.adding : buttonCopy.add}
          </button>
        </div>
      </div>
    </form>
  );
}
