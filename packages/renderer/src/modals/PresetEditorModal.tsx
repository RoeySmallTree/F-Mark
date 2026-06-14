/* PresetEditorModal — edit or create a custom preset.

   Opened by:
     - the + button in the Presets popover header (creates a new preset).
     - the pencil icon on any custom preset row (edits that preset).

   Custom presets are renderer-local (localStorage under
   `fmark:settings:custom-presets`). Built-in / project presets are
   read-only — we don't open this modal for them.

   The modal also hosts category management: clicking the pencil button
   next to the CATEGORY label replaces the seg-control with an inline
   editor for adding, renaming, deleting categories, and curating the
   emoji pool / workspace gating per category. Categories are
   renderer-local (localStorage under `fmark:settings:custom-categories`)
   and seeded once with the conventional Generate / Critique / Format
   triple so kernel-shipped built-in presets stay grouped on first open. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { X, Trash2, Smile, Pencil, Plus, Check } from "lucide-react";
import { useStore } from "../state/store.js";
import {
  newCustomPresetId,
  removeCustomPreset,
  upsertCustomPreset,
  type CustomPreset,
} from "../popovers/customPresets.js";
import {
  loadCustomCategories,
  newCustomCategoryId,
  nextCategoryOrder,
  removeCustomCategory,
  upsertCustomCategory,
  type CustomCategory,
} from "../popovers/customCategories.js";

const DEFAULT_EMOJI = "✨";

interface EmojiPickerProps {
  value: string;
  emojis: ReadonlyArray<string>;
  onChange(next: string): void;
  onClose(): void;
}

function EmojiPicker({
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
      {emojis.length > 0 ? (
        <div className="emoji-picker-group">
          <div className="emoji-picker-grid">
            {emojis.map((e) => (
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

/* Friendly label for a path: prefer a matching favorite name, else
   the basename. Falls back to the full path when neither is useful. */
function pathLabel(
  path: string,
  favorites: ReadonlyArray<{ name: string; path: string }>,
): string {
  const fav = favorites.find((f) => f.path === path);
  if (fav !== undefined) return fav.name;
  const parts = path.split("/").filter((s) => s.length > 0);
  const last = parts[parts.length - 1];
  return last !== undefined ? last : path;
}

interface WorkspaceChipsProps {
  /* Currently-selected workspace paths. */
  selected: ReadonlyArray<string>;
  onToggle(path: string): void;
  ariaLabel: string;
}

function WorkspaceChips({
  selected,
  onToggle,
  ariaLabel,
}: WorkspaceChipsProps): JSX.Element {
  const activePath = useStore((s) => s.activePath);
  const knownPaths = useStore((s) => s.knownPaths);
  const favorites = useStore((s) => s.favorites);

  /* Available chips = current + favorites + knownPaths + any extra paths
     already selected (so the user can deselect them even if they left the
     known-paths list since). De-duped, current first. */
  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    if (activePath !== null && activePath.length > 0) {
      seen.add(activePath);
      out.push(activePath);
    }
    for (const f of favorites) {
      if (!seen.has(f.path)) {
        seen.add(f.path);
        out.push(f.path);
      }
    }
    for (const p of knownPaths) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    for (const p of selected) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
    return out;
  }, [activePath, favorites, knownPaths, selected]);

  if (chips.length === 0) {
    return (
      <div className="ws-chips-empty">
        No known workspaces yet. Visit a folder to add it.
      </div>
    );
  }

  return (
    <div className="ws-chips" role="group" aria-label={ariaLabel}>
      {chips.map((p) => {
        const on = selected.includes(p);
        const isCurrent = p === activePath;
        const label = pathLabel(p, favorites);
        return (
          <button
            key={p}
            type="button"
            className={`ws-chip${on ? " on" : ""}`}
            onClick={() => onToggle(p)}
            aria-pressed={on}
            title={p}
          >
            {on ? (
              <Check size={11} aria-hidden className="ws-chip-check" />
            ) : null}
            <span className="ws-chip-label">{label}</span>
            {isCurrent ? (
              <span className="ws-chip-current">current</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* Inline emoji-pool editor used in the category-management panel.
   Shows each emoji as a chip with an X to remove, plus a small input
   to add a new one. */
interface EmojiPoolEditorProps {
  emojis: ReadonlyArray<string>;
  onChange(next: string[]): void;
}

function EmojiPoolEditor({
  emojis,
  onChange,
}: EmojiPoolEditorProps): JSX.Element {
  const [draft, setDraft] = useState("");

  function addEmoji(): void {
    const v = draft.trim();
    if (v.length === 0) return;
    if (emojis.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...emojis, v]);
    setDraft("");
  }

  return (
    <div className="emoji-pool">
      {emojis.map((e) => (
        <span key={e} className="emoji-pool-chip">
          <span aria-hidden>{e}</span>
          <button
            type="button"
            className="emoji-pool-chip-x"
            aria-label={`Remove ${e}`}
            onClick={() => onChange(emojis.filter((x) => x !== e))}
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
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
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

interface CategoryRowProps {
  category: CustomCategory;
  onPatch(patch: Partial<CustomCategory>): void;
  onDelete(): void;
}

function CategoryRow({
  category,
  onPatch,
  onDelete,
}: CategoryRowProps): JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div className="cat-row">
      <div className="cat-row-head">
        <span className="cat-row-icon" aria-hidden>
          {category.emojis[0] ?? "•"}
        </span>
        <input
          type="text"
          className="cat-row-name"
          value={category.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Category name"
          aria-label={`Name for ${category.name || "category"}`}
          maxLength={40}
        />
        {confirmingDelete ? (
          <>
            <span className="cat-row-confirm-hint">Delete?</span>
            <button
              type="button"
              className="btn-ghost cat-row-confirm-yes"
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
            className="icon-btn cat-row-trash"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${category.name || "category"}`}
            title="Delete category"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        )}
      </div>
      <div className="cat-row-sub">
        <div className="cat-row-sub-label">EMOJIS</div>
        <EmojiPoolEditor
          emojis={category.emojis}
          onChange={(emojis) => onPatch({ emojis })}
        />
      </div>
      <div className="cat-row-sub">
        <div className="cat-row-sub-label">
          WORKSPACES
          <span className="form-hint-inline">empty = all</span>
        </div>
        <WorkspaceChips
          selected={category.workspaces}
          ariaLabel={`Workspaces for ${category.name || "category"}`}
          onToggle={(path) => {
            const ws = category.workspaces.includes(path)
              ? category.workspaces.filter((p) => p !== path)
              : [...category.workspaces, path];
            onPatch({ workspaces: ws });
          }}
        />
      </div>
    </div>
  );
}

interface CategoriesPanelProps {
  categories: ReadonlyArray<CustomCategory>;
  onDone(): void;
  onAfterMutate(): void;
}

function CategoriesPanel({
  categories,
  onDone,
  onAfterMutate,
}: CategoriesPanelProps): JSX.Element {
  function patch(id: string, p: Partial<CustomCategory>): void {
    const cat = categories.find((c) => c.id === id);
    if (cat === undefined) return;
    upsertCustomCategory({ ...cat, ...p });
    onAfterMutate();
  }
  function remove(id: string): void {
    removeCustomCategory(id);
    onAfterMutate();
  }
  function add(): void {
    upsertCustomCategory({
      id: newCustomCategoryId(),
      name: "New category",
      emojis: [DEFAULT_EMOJI],
      workspaces: [],
      order: nextCategoryOrder(),
    });
    onAfterMutate();
  }
  return (
    <div className="cat-panel">
      <div className="cat-panel-head">
        <span className="cat-panel-title">MANAGE CATEGORIES</span>
        <button
          type="button"
          className="btn-ghost cat-panel-done"
          onClick={onDone}
        >
          Done
        </button>
      </div>
      {categories.length === 0 ? (
        <div className="cat-panel-empty">
          No categories yet. Add one to start grouping presets.
        </div>
      ) : (
        <div className="cat-panel-list">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              onPatch={(p) => patch(c.id, p)}
              onDelete={() => remove(c.id)}
            />
          ))}
        </div>
      )}
      <button type="button" className="cat-panel-add" onClick={add}>
        <Plus size={12} aria-hidden /> Add category
      </button>
    </div>
  );
}

export function PresetEditorModal(): JSX.Element {
  const editingPreset = useStore((s) => s.editingPreset);
  const closeModal = useStore((s) => s.closeModal);
  const bumpCustomPresets = useStore((s) => s.bumpCustomPresets);
  const bumpCustomCategories = useStore((s) => s.bumpCustomCategories);
  const customCategoriesVersion = useStore((s) => s.customCategoriesVersion);

  const isNew = editingPreset === null;

  /* Re-read categories whenever they change (or first mount). */
  const categories = useMemo<CustomCategory[]>(
    () => loadCustomCategories(),
    [customCategoriesVersion],
  );

  const initial = useMemo<CustomPreset>(
    () =>
      editingPreset ?? {
        id: newCustomPresetId(),
        name: "",
        group: categories[0]?.id ?? "generate",
        icon: DEFAULT_EMOJI,
        body: "",
        workspaces: [],
      },
    [editingPreset, categories],
  );

  const [name, setName] = useState(initial.name);
  const [group, setGroup] = useState<string>(initial.group);
  const [icon, setIcon] = useState(initial.icon);
  const [body, setBody] = useState(initial.body);
  const [workspaces, setWorkspaces] = useState<string[]>(initial.workspaces);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);

  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isNew) nameRef.current?.focus();
  }, [isNew]);

  /* If the user deletes the category this preset is assigned to, fall
     back to the first remaining category so save stays valid. If they
     deleted everything, keep the orphan id — the popover will route it
     to Uncategorized. */
  useEffect(() => {
    const first = categories[0];
    if (first === undefined) return;
    if (!categories.some((c) => c.id === group)) {
      setGroup(first.id);
    }
  }, [categories, group]);

  /* Emojis available in the picker = the selected category's pool.
     Orphan group → empty pool (freeform only). */
  const categoryEmojis = useMemo<string[]>(() => {
    const c = categories.find((x) => x.id === group);
    return c?.emojis ?? [];
  }, [categories, group]);

  const canSave = name.trim().length > 0 && body.trim().length > 0;

  const onSave = useCallback((): void => {
    if (!canSave) return;
    upsertCustomPreset({
      id: initial.id,
      name: name.trim(),
      group,
      icon: icon.length > 0 ? icon : DEFAULT_EMOJI,
      body: body.trim(),
      workspaces,
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
    workspaces,
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

  function toggleWorkspace(p: string): void {
    setWorkspaces((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
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
                emojis={categoryEmojis}
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
          <div className="form-label-row">
            <span className="form-label">CATEGORY</span>
            {!managingCategories ? (
              <button
                type="button"
                className="form-label-action"
                onClick={() => setManagingCategories(true)}
                aria-label="Edit categories"
                title="Edit categories"
              >
                <Pencil size={11} aria-hidden /> Edit
              </button>
            ) : null}
          </div>
          {managingCategories ? (
            <CategoriesPanel
              categories={categories}
              onAfterMutate={bumpCustomCategories}
              onDone={() => setManagingCategories(false)}
            />
          ) : categories.length === 0 ? (
            <div className="cat-empty-inline">
              No categories.{" "}
              <button
                type="button"
                className="btn-ghost cat-empty-inline-btn"
                onClick={() => setManagingCategories(true)}
              >
                Create one
              </button>
            </div>
          ) : (
            <div
              className="seg-control seg-control-wrap"
              role="radiogroup"
              aria-label="Category"
            >
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={group === c.id}
                  className={group === c.id ? "on" : ""}
                  onClick={() => setGroup(c.id)}
                >
                  <span className="seg-emoji" aria-hidden>
                    {c.emojis[0] ?? "•"}
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
          )}
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

        <div className="form-row" style={{ marginTop: 18 }}>
          <div className="form-label" style={{ marginBottom: 8 }}>
            RELEVANT WORKSPACES
            <span className="form-hint-inline">empty = all</span>
          </div>
          <WorkspaceChips
            selected={workspaces}
            onToggle={toggleWorkspace}
            ariaLabel="Relevant workspaces"
          />
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
