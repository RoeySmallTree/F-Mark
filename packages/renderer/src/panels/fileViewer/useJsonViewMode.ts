import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_JSON_VIEW_MODE,
  readJsonViewMode,
  writeJsonViewMode,
  type JsonViewMode,
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

export function getJsonViewMode(): JsonViewMode {
  return readJsonViewMode();
}

export function setJsonViewMode(value: JsonViewMode): void {
  writeJsonViewMode(value);
  emit();
}

export function useJsonViewMode(): [
  JsonViewMode,
  (next: JsonViewMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribe,
    getJsonViewMode,
    () => DEFAULT_JSON_VIEW_MODE,
  );
  const setMode = useCallback((next: JsonViewMode): void => {
    setJsonViewMode(next);
  }, []);
  return [mode, setMode];
}

export type { JsonViewMode };
