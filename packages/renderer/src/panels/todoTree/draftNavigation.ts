import type { FlattenedTodo } from "../todoPanelUtils.js";
import type { DraftTodo } from "./types.js";

export function previousSameDepthIdForDraft(
  currentDraft: DraftTodo,
  depth: number,
  flat: FlattenedTodo[],
  flatById: Map<string, FlattenedTodo>,
): string | null {
  let searchFrom = flat.length - 1;
  if (currentDraft.afterId !== undefined) {
    const idx = flat.findIndex((item) => item.id === currentDraft.afterId);
    if (idx >= 0) searchFrom = idx;
  } else if (currentDraft.parentId !== undefined) {
    const parentIdx = flat.findIndex(
      (item) => item.id === currentDraft.parentId,
    );
    const parentDepth = flatById.get(currentDraft.parentId)?.depth;
    if (parentIdx >= 0 && parentDepth !== undefined) {
      searchFrom = parentIdx;
      for (
        let idx = parentIdx + 1;
        idx < flat.length && flat[idx]!.depth > parentDepth;
        idx += 1
      ) {
        searchFrom = idx;
      }
    }
  }
  for (let idx = searchFrom; idx >= 0; idx -= 1) {
    const item = flat[idx]!;
    if (item.depth === depth) return item.id;
  }
  return null;
}

export function previousFocusIdForDraft(
  currentDraft: DraftTodo,
  flat: FlattenedTodo[],
): string | null {
  return (
    currentDraft.afterId ??
    currentDraft.parentId ??
    flat[flat.length - 1]?.id ??
    null
  );
}
