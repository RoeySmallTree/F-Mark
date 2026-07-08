import type { DragEvent } from "react";

export function isLeavingDropContainer(
  event: DragEvent<HTMLElement>,
): boolean {
  const related = event.relatedTarget as Node | null;
  return related === null || !event.currentTarget.contains(related);
}
