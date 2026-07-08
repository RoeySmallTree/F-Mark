import { useState, type JSX } from "react";
import { X } from "lucide-react";

interface EmojiPoolEditorProps {
  emojis: ReadonlyArray<string>;
  onChange(next: string[]): void;
}

export function EmojiPoolEditor({
  emojis,
  onChange,
}: EmojiPoolEditorProps): JSX.Element {
  const [draft, setDraft] = useState("");

  function addEmoji(): void {
    const value = draft.trim();
    if (value.length === 0) return;
    if (!emojis.includes(value)) onChange([...emojis, value]);
    setDraft("");
  }

  return (
    <div className="emoji-pool">
      {emojis.map((emoji) => (
        <span key={emoji} className="emoji-pool-chip">
          <span aria-hidden>{emoji}</span>
          <button
            type="button"
            className="emoji-pool-chip-x"
            aria-label={`Remove ${emoji}`}
            onClick={() => onChange(emojis.filter((item) => item !== emoji))}
          >
            <X size={9} aria-hidden />
          </button>
        </span>
      ))}
      <input
        type="text"
        className="emoji-pool-input"
        value={draft}
        maxLength={4}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addEmoji();
          }
        }}
        placeholder="+ add"
        aria-label="Add emoji to category"
      />
      {draft.trim().length > 0 ? (
        <button
          type="button"
          className="btn-ghost emoji-pool-add"
          onClick={addEmoji}
        >
          Add
        </button>
      ) : null}
    </div>
  );
}
