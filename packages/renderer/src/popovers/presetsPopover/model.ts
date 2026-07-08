import type { Preset } from "@f-mark/shared";
import type { CustomCategory } from "../customCategories.js";
import type { PresetSection } from "./types.js";

export const UNCATEGORIZED_KEY = "__uncategorized__";

function caseInsensitiveSubstring(
  preset: Preset,
  needle: string,
): boolean {
  if (needle.length === 0) return true;
  const query = needle.toLowerCase();
  return (
    preset.name.toLowerCase().includes(query) ||
    preset.body.toLowerCase().includes(query)
  );
}

function categoryVisible(
  category: CustomCategory,
  activePath: string | null,
): boolean {
  if (category.workspaces.length === 0) return true;
  if (activePath === null) return false;
  return category.workspaces.includes(activePath);
}

function presetVisible(
  preset: Preset,
  activePath: string | null,
): boolean {
  if (preset.workspaces === undefined || preset.workspaces.length === 0) {
    return true;
  }
  if (activePath === null) return false;
  return preset.workspaces.includes(activePath);
}

export function groupPresetsByCategory({
  categories,
  builtin,
  custom,
  query,
  activePath,
}: {
  categories: ReadonlyArray<CustomCategory>;
  builtin: ReadonlyArray<Preset>;
  custom: ReadonlyArray<Preset>;
  query: string;
  activePath: string | null;
}): PresetSection[] {
  const visibleCategories = categories.filter((category) =>
    categoryVisible(category, activePath),
  );
  const knownCategoryIds = new Set(categories.map((category) => category.id));
  const combined = [...builtin, ...custom].filter((preset) =>
    caseInsensitiveSubstring(preset, query),
  );
  const { byCategory, orphans } = splitPresetsByCategory(
    combined,
    knownCategoryIds,
  );

  const sections: PresetSection[] = visibleCategories
    .map((category) => ({
      category,
      presets: visiblePresets(byCategory.get(category.id) ?? [], activePath),
    }))
    .filter((section) => section.presets.length > 0);

  const visibleOrphans = visiblePresets(orphans, activePath);
  if (visibleOrphans.length > 0) {
    sections.push({ category: null, presets: visibleOrphans });
  }

  return sections;
}

export function filterProjectPresets(
  project: ReadonlyArray<Preset>,
  query: string,
  activePath: string | null,
): Preset[] {
  return project.filter(
    (preset) =>
      caseInsensitiveSubstring(preset, query) &&
      presetVisible(preset, activePath),
  );
}

function splitPresetsByCategory(
  presets: ReadonlyArray<Preset>,
  knownCategoryIds: ReadonlySet<string>,
): { byCategory: Map<string, Preset[]>; orphans: Preset[] } {
  const byCategory = new Map<string, Preset[]>();
  const orphans: Preset[] = [];

  for (const preset of presets) {
    if (!knownCategoryIds.has(preset.group)) {
      orphans.push(preset);
      continue;
    }
    const list = byCategory.get(preset.group) ?? [];
    list.push(preset);
    byCategory.set(preset.group, list);
  }

  return { byCategory, orphans };
}

function visiblePresets(
  presets: ReadonlyArray<Preset>,
  activePath: string | null,
): Preset[] {
  return presets.filter((preset) => presetVisible(preset, activePath));
}
