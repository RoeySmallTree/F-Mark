export function canSaveSkill(name: string): boolean {
  return name.trim().length > 0 && !/[\s/]/.test(name.trim());
}

export function shortSkillPath(path: string): string {
  const marker = "/skills/";
  const idx = path.lastIndexOf(marker);
  if (idx >= 0) return path.slice(idx + marker.length);
  const parts = path.split("/");
  return parts.slice(Math.max(0, parts.length - 3)).join("/");
}
