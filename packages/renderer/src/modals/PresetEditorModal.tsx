/* PresetEditorModal — edit or create a custom preset.

   Opened by:
     - the + button in the Presets popover header (creates a new preset).
     - the pencil icon on any custom preset row (edits that preset).

   Custom presets are renderer-local (localStorage under
   `fmark:settings:custom-presets`). Built-in / project presets are
   read-only — we don't open this modal for them. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { X, Trash2, Smile } from "lucide-react";
import type { PresetGroup } from "@f-mark/shared";
import { useStore } from "../state/store.js";
import {
  newCustomPresetId,
  removeCustomPreset,
  upsertCustomPreset,
  type CustomPreset,
} from "../popovers/customPresets.js";

const CATEGORIES: ReadonlyArray<{ key: PresetGroup; label: string }> = [
  { key: "generate", label: "GENERATE" },
  { key: "critique", label: "CRITIQUE" },
  { key: "format", label: "FORMAT" },
];

/* Curated emoji set, grouped semantically. The picker is intentionally
   small and opinionated — the goal is to make picking *feel* fast, not
   to provide an exhaustive set. Falls back to a freeform text field for
   anything not in the grid. */
const EMOJI_GROUPS: ReadonlyArray<{ label: string; emojis: string[] }> = [
  {
    label: "Make",
    emojis: ["✨", "📐", "🔀", "🪄", "🎯", "🧱", "📋", "🧪", "🛠", "🌱"],
  },
  {
    label: "Refine",
    emojis: ["✂️", "🪨", "🧽", "🔍", "🎚", "📏", "🧹", "🪞", "⚖️", "🔬"],
  },
  {
    label: "Critique",
    emojis: ["🧐", "❓", "⚠️", "🚩", "💭", "🤔", "🕳", "👁", "🪤", "🩻"],
  },
  {
    label: "Voice",
    emojis: ["💬", "📣", "📜", "🗣", "📝", "📚", "✍️", "🖋", "🪶", "📒"],
  },
  {
    label: "Flow",
    emojis: ["⚡️", "🌀", "🔁", "➡️", "⏩", "🪁", "🚀", "🛤", "🧭", "🗺"],
  },
  {
    label: "Feel",
    emojis: ["🔥", "💎", "🌙", "☀️", "🌊", "🌿", "🪴", "🍃", "🌾", "🕯"],
  },
];

const DEFAULT_EMOJI = "✨";

function asGroup(v: string): PresetGroup {
  if (v === "generate" || v === "critique" || v === "format") return v;
  return "generate";
}

interface EmojiPickerProps {
  value: string;
  onChange(next: string): void;
  onClose(): void;
}

function EmojiPicker({ value, onChange, onClose }: EmojiPickerProps): JSX.Element {
  const [freeform, setFreeform] = useState(value);
  const popRef = useRef<HTMLDivElement | null>(null);

  /* Click outside closes — but only after the same-tick mousedown that
     opened us has finished. */
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (popRef.current === null) return;
      if (!(e.target instanceof Node)) return;
      if (popRef.current.contains(e.target)) return;
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

  return (
    <div
      ref={popRef}
      className="emoji-picker"
      role="dialog"
      aria-label="Pick an emoji"
    >
      {EMOJI_GROUPS.map((g) => (
        <div key={g.label} className="emoji-picker-group">
          <div className="emoji-picker-label">{g.label}</div>
          <div className="emoji-picker-grid">
            {g.emojis.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-picker-cell${e === value ? " on" : ""}`}
                onClick={() => {
                  onChange(e);
                  onClose();
                }}
                aria-label={`Pick ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="emoji-picker-freeform">
        <span className="emoji-picker-label">CUSTOM</span>
        <input
          type="text"
          value={freeform}
          maxLength={4}
          onChange={(e) => setFreeform(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && freeform.trim().length > 0) {
              onChange(freeform.trim());
              onClose();
            }
          }}
          placeholder="Paste any emoji"
          aria-label="Custom emoji"
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (freeform.trim().length > 0) {
              onChange(freeform.trim());
              onClose();
            }
          }}
        >
          Use
        </button>
      </div>
    </div>
  );
}

export function PresetEditorModal(): JSX.Element {
  const editingPreset = useStore((s) => s.editingPreset);
  const closeModal = useStore((s) => s.closeModal);
  const bumpCustomPresets = useStore((s) => s.bumpCustomPresets);

  const isNew = editingPreset === null;
  const initial = useMemo<CustomPreset>(
    () =>
      editingPreset ?? {
        id: newCustomPresetId(),
        name: "",
        group: "generate",
        icon: DEFAULT_EMOJI,
        body: "",
      },
    [editingPreset],
  );

  const [name, setName] = useState(initial.name);
  const [group, setGroup] = useState<PresetGroup>(initial.group);
  const [icon, setIcon] = useState(initial.icon);
  const [body, setBody] = useState(initial.body);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isNew) nameRef.current?.focus();
  }, [isNew]);

  const canSave = name.trim().length > 0 && body.trim().length > 0;

  const onSave = useCallback((): void => {
    if (!canSave) return;
    upsertCustomPreset({
      id: initial.id,
      name: name.trim(),
      group,
      icon: icon.length > 0 ? icon : DEFAULT_EMOJI,
      body: body.trim(),
    });
    bumpCustomPresets();
    closeModal();
  }, [
    canSave,
    initial.id,
    name,
    group,
    icon,
    body,
    bumpCustomPresets,
    closeModal,
  ]);

  const onDelete = useCallback((): void => {
    if (isNew) return;
    removeCustomPreset(initial.id);
    bumpCustomPresets();
    closeModal();
  }, [isNew, initial.id, bumpCustomPresets, closeModal]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave();
    }
  }

  return (
    <div
      className="modal preset-editor"
      style={{ width: 560 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-editor-title"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <div className="modal-head">
        <div className="modal-eyebrow">{isNew ? "NEW PRESET" : "EDIT PRESET"}</div>
        <h2 className="modal-title" id="preset-editor-title">
          {isNew ? "A new preset" : "Edit preset"}
        </h2>
        <button
          type="button"
          className="icon-btn modal-close"
          aria-label="Close"
          onClick={closeModal}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="modal-body">
        <div className="preset-editor-head">
          <div className="preset-editor-emoji-wrap">
            <button
              type="button"
              className="preset-editor-emoji"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={emojiOpen}
              aria-label={`Emoji: ${icon}. Click to change.`}
            >
              <span aria-hidden>{icon}</span>
              <Smile
                size={11}
                aria-hidden
                className="preset-editor-emoji-hint"
              />
            </button>
            {emojiOpen && (
              <EmojiPicker
                value={icon}
                onChange={setIcon}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <input
            ref={nameRef}
            type="text"
            className="preset-editor-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your preset…"
            aria-label="Preset name"
            maxLength={80}
          />
        </div>

        <div className="form-row" style={{ marginTop: 18 }}>
          <div className="form-label" style={{ marginBottom: 8 }}>
            CATEGORY
          </div>
          <div className="seg-control" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={group === c.key}
                className={group === c.key ? "on" : ""}
                onClick={() => setGroup(asGroup(c.key))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row" style={{ marginTop: 18 }}>
          <div className="form-label" style={{ marginBottom: 8 }}>
            CONTENT
          </div>
          <textarea
            className="form-textarea preset-editor-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the prompt this preset will insert…"
            aria-label="Preset content"
            rows={8}
          />
          <div className="form-hint">
            Inserted into the compose box when picked. Edit before sending.
          </div>
        </div>
      </div>

      <div className="modal-foot">
        {!isNew && (
          <div className="preset-editor-delete">
            {confirmingDelete ? (
              <>
                <span className="hint" style={{ flex: "none", marginRight: 8 }}>
                  Delete this preset?
                </span>
                <button
                  type="button"
                  className="btn-ghost preset-editor-confirm-delete"
                  onClick={onDelete}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-ghost preset-editor-delete-btn"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete preset"
              >
                <Trash2 size={12} aria-hidden />
                Remove
              </button>
            )}
          </div>
        )}
        <div className="hint" />
        <div className="foot-actions">
          <button type="button" className="btn-ghost" onClick={closeModal}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-solid"
            disabled={!canSave}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
