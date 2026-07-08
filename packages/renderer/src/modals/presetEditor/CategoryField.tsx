import { type JSX } from "react";
import { Pencil } from "lucide-react";
import type { CustomCategory } from "../../popovers/customCategories.js";
import { CategoriesPanel } from "./CategoriesPanel.js";

interface CategoryFieldProps {
  categories: ReadonlyArray<CustomCategory>;
  group: string;
  managingCategories: boolean;
  onGroupChange(group: string): void;
  onManagingCategoriesChange(managing: boolean): void;
  onAfterMutate(): void;
}

export function CategoryField({
  categories,
  group,
  managingCategories,
  onGroupChange,
  onManagingCategoriesChange,
  onAfterMutate,
}: CategoryFieldProps): JSX.Element {
  return (
    <div className="form-row" style={{ marginTop: 18 }}>
      <div className="form-label-row">
        <span className="form-label">CATEGORY</span>
        {!managingCategories ? (
          <button
            type="button"
            className="form-label-action"
            onClick={() => onManagingCategoriesChange(true)}
            aria-label="Edit categories"
            title="Edit categories"
          >
            <Pencil size={11} aria-hidden /> Edit
          </button>
        ) : null}
      </div>
      <CategoryFieldBody
        categories={categories}
        group={group}
        managingCategories={managingCategories}
        onGroupChange={onGroupChange}
        onManagingCategoriesChange={onManagingCategoriesChange}
        onAfterMutate={onAfterMutate}
      />
    </div>
  );
}

function CategoryFieldBody({
  categories,
  group,
  managingCategories,
  onGroupChange,
  onManagingCategoriesChange,
  onAfterMutate,
}: CategoryFieldProps): JSX.Element {
  if (managingCategories) {
    return (
      <CategoriesPanel
        categories={categories}
        onAfterMutate={onAfterMutate}
        onDone={() => onManagingCategoriesChange(false)}
      />
    );
  }
  if (categories.length === 0) {
    return (
      <div className="cat-empty-inline">
        No categories.{" "}
        <button
          type="button"
          className="btn-ghost cat-empty-inline-btn"
          onClick={() => onManagingCategoriesChange(true)}
        >
          Create one
        </button>
      </div>
    );
  }
  return (
    <div
      className="seg-control seg-control-wrap"
      role="radiogroup"
      aria-label="Category"
    >
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          role="radio"
          aria-checked={group === category.id}
          className={group === category.id ? "on" : ""}
          onClick={() => onGroupChange(category.id)}
        >
          <span className="seg-emoji" aria-hidden>
            {category.emojis[0] ?? "•"}
          </span>
          {category.name}
        </button>
      ))}
    </div>
  );
}
