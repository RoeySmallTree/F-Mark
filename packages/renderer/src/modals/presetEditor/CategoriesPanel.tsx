import { useState, type JSX } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  newCustomCategoryId,
  nextCategoryOrder,
  removeCustomCategory,
  upsertCustomCategory,
  type CustomCategory,
} from "../../popovers/customCategories.js";
import { DEFAULT_EMOJI, toggleStringSelection } from "./model.js";
import { EmojiPoolEditor } from "./EmojiPoolEditor.js";
import { WorkspaceChips } from "./WorkspaceChips.js";

const NO_LOOSE_STRING_VALUES = {
  category: "category",
} as const;

interface CategoriesPanelProps {
  categories: ReadonlyArray<CustomCategory>;
  onDone(): void;
  onAfterMutate(): void;
}

export function CategoriesPanel({
  categories,
  onDone,
  onAfterMutate,
}: CategoriesPanelProps): JSX.Element {
  function patch(id: string, patch: Partial<CustomCategory>): void {
    const category = categories.find((candidate) => candidate.id === id);
    if (category === undefined) return;
    upsertCustomCategory({ ...category, ...patch });
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
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onPatch={(nextPatch) => patch(category.id, nextPatch)}
              onDelete={() => remove(category.id)}
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
          onChange={(event) => onPatch({ name: event.target.value })}
          placeholder="Category name"
          aria-label={`Name for ${category.name || "category"}`}
          maxLength={40}
        />
        <CategoryDeleteControl
          categoryName={category.name}
          confirming={confirmingDelete}
          onConfirm={onDelete}
          onStart={() => setConfirmingDelete(true)}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
      <CategoryEmojiRow category={category} onPatch={onPatch} />
      <CategoryWorkspaceRow category={category} onPatch={onPatch} />
    </div>
  );
}

function CategoryDeleteControl({
  categoryName,
  confirming,
  onConfirm,
  onStart,
  onCancel,
}: {
  categoryName: string;
  confirming: boolean;
  onConfirm(): void;
  onStart(): void;
  onCancel(): void;
}): JSX.Element {
  if (confirming) {
    return (
      <>
        <span className="cat-row-confirm-hint">Delete?</span>
        <button
          type="button"
          className="btn-ghost cat-row-confirm-yes"
          onClick={onConfirm}
        >
          Delete
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Keep
        </button>
      </>
    );
  }
  return (
    <button
      type="button"
      className="icon-btn cat-row-trash"
      onClick={onStart}
      aria-label={`Delete ${categoryName || "category"}`}
      title="Delete category"
    >
      <Trash2 size={12} aria-hidden />
    </button>
  );
}

function CategoryEmojiRow({
  category,
  onPatch,
}: Pick<CategoryRowProps, "category" | "onPatch">): JSX.Element {
  return (
    <div className="cat-row-sub">
      <div className="cat-row-sub-label">EMOJIS</div>
      <EmojiPoolEditor
        emojis={category.emojis}
        onChange={(emojis) => onPatch({ emojis })}
      />
    </div>
  );
}

function CategoryWorkspaceRow({
  category,
  onPatch,
}: Pick<CategoryRowProps, "category" | "onPatch">): JSX.Element {
  return (
    <div className="cat-row-sub">
      <div className="cat-row-sub-label">
        WORKSPACES
        <span className="form-hint-inline">empty = all</span>
      </div>
      <WorkspaceChips
        selected={category.workspaces}
        ariaLabel={`Workspaces for ${category.name || NO_LOOSE_STRING_VALUES.category}`}
        onToggle={(path) => {
          onPatch({
            workspaces: toggleStringSelection(category.workspaces, path),
          });
        }}
      />
    </div>
  );
}
