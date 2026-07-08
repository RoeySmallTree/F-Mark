import type { CustomCategory } from "../../popovers/customCategories.js";
import type { CustomPreset } from "../../popovers/customPresets.js";

const NO_LOOSE_STRING_VALUES = {
  generate: "generate",
} as const;

export const DEFAULT_EMOJI = "✨";

export interface FavoritePath {
  name: string;
  path: string;
}

export function newPresetDraft(
  id: string,
  categories: ReadonlyArray<CustomCategory>,
): CustomPreset {
  return {
    id,
    name: "",
    group: categories[0]?.id ?? NO_LOOSE_STRING_VALUES.generate,
    icon: DEFAULT_EMOJI,
    body: "",
    workspaces: [],
  };
}

export function canSavePreset(name: string, body: string): boolean {
  return name.trim().length > 0 && body.trim().length > 0;
}

export function categoryEmojiPool(
  categories: ReadonlyArray<CustomCategory>,
  group: string,
): string[] {
  const category = categories.find((candidate) => candidate.id === group);
  return category?.emojis ?? [];
}

export function selectedOrFallbackGroup(
  categories: ReadonlyArray<CustomCategory>,
  group: string,
): string | null {
  const first = categories[0];
  if (first === undefined) return null;
  return categories.some((category) => category.id === group) ? group : first.id;
}

export function toggleStringSelection(
  selected: ReadonlyArray<string>,
  value: string,
): string[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

export function presetForSave({
  id,
  name,
  group,
  icon,
  body,
  workspaces,
}: {
  id: string;
  name: string;
  group: string;
  icon: string;
  body: string;
  workspaces: string[];
}): CustomPreset {
  return {
    id,
    name: name.trim(),
    group,
    icon: icon.length > 0 ? icon : DEFAULT_EMOJI,
    body: body.trim(),
    workspaces,
  };
}

/* Friendly label for a path: prefer a matching favorite name, else
   the basename. Falls back to the full path when neither is useful. */
export function pathLabel(
  path: string,
  favorites: ReadonlyArray<FavoritePath>,
): string {
  const favorite = favorites.find((candidate) => candidate.path === path);
  if (favorite !== undefined) return favorite.name;
  const parts = path.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last !== undefined ? last : path;
}

export function workspaceChipPaths({
  activePath,
  favorites,
  knownPaths,
  selected,
}: {
  activePath: string | null;
  favorites: ReadonlyArray<FavoritePath>;
  knownPaths: ReadonlyArray<string>;
  selected: ReadonlyArray<string>;
}): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  addPath(activePath, seen, paths);
  for (const favorite of favorites) addPath(favorite.path, seen, paths);
  for (const path of knownPaths) addPath(path, seen, paths);
  for (const path of selected) addPath(path, seen, paths);
  return paths;
}

function addPath(
  path: string | null,
  seen: Set<string>,
  paths: string[],
): void {
  if (path === null || path.length === 0 || seen.has(path)) return;
  seen.add(path);
  paths.push(path);
}
