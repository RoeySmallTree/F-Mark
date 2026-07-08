import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_MARKDOWN_VIEW_MODE,
  readMarkdownViewMode,
  writeMarkdownViewMode,
  type MarkdownViewMode,
} from "../../state/settings.js";

const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      /* swallow */
    }
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getMarkdownViewMode(): MarkdownViewMode {
  return readMarkdownViewMode();
}

export function setMarkdownViewMode(value: MarkdownViewMode): void {
  writeMarkdownViewMode(value);
  emit();
}

export function useMarkdownViewMode(): [
  MarkdownViewMode,
  (next: MarkdownViewMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribe,
    getMarkdownViewMode,
    () => DEFAULT_MARKDOWN_VIEW_MODE,
  );
  const setMode = useCallback((next: MarkdownViewMode): void => {
    setMarkdownViewMode(next);
  }, []);
  return [mode, setMode];
}

export type { MarkdownViewMode };
