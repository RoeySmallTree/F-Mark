import { useEffect, useRef, useState, type JSX } from "react";

interface EmojiPickerProps {
  value: string;
  emojis: ReadonlyArray<string>;
  onChange(next: string): void;
  onClose(): void;
}

export function EmojiPicker({
  value,
  emojis,
  onChange,
  onClose,
}: EmojiPickerProps): JSX.Element {
  const [freeform, setFreeform] = useState(value);
  const popRef = useRef<HTMLDivElement | null>(null);

  /* Click outside closes — but only after the same-tick mousedown that
     opened us has finished. */
  useEffect(() => {
    function onDocMouseDown(event: MouseEvent): void {
      if (popRef.current === null) return;
      if (!(event.target instanceof Node)) return;
      if (popRef.current.contains(event.target)) return;
      onClose();
    }
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocMouseDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [onClose]);

  function commitFreeform(): void {
    const next = freeform.trim();
    if (next.length === 0) return;
    onChange(next);
    onClose();
  }

  return (
    <div
      ref={popRef}
      className="emoji-picker"
      role="dialog"
      aria-label="Pick an emoji"
    >
      {emojis.length > 0 ? (
        <div className="emoji-picker-group">
          <div className="emoji-picker-grid">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`emoji-picker-cell${emoji === value ? " on" : ""}`}
                onClick={() => {
                  onChange(emoji);
                  onClose();
                }}
                aria-label={`Pick ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="emoji-picker-empty">
          No emojis in this category. Use custom →
        </div>
      )}
      <div className="emoji-picker-freeform">
        <span className="emoji-picker-label">CUSTOM</span>
        <input
          type="text"
          value={freeform}
          maxLength={4}
          onChange={(event) => setFreeform(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitFreeform();
          }}
          placeholder="Paste any emoji"
          aria-label="Custom emoji"
        />
        <button type="button" className="btn-ghost" onClick={commitFreeform}>
          Use
        </button>
      </div>
    </div>
  );
}
