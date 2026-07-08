const RECENT_PRESET_LIMIT = 4;

export function basename(absPath: string): string {
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

export function recentPresetPaths(
  knownPaths: string[],
  favoritePaths: Set<string>,
): string[] {
  return knownPaths
    .filter((path) => !favoritePaths.has(path))
    .slice(0, RECENT_PRESET_LIMIT);
}
