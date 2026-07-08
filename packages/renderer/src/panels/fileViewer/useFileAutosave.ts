import { useCallback, useSyncExternalStore } from "react";
import {
  readFileAutosave,
  writeFileAutosave,
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

export function getFileAutosave(): boolean {
  return readFileAutosave();
}

export function setFileAutosave(value: boolean): void {
  writeFileAutosave(value);
  emit();
}

export function useFileAutosave(): [boolean, (next: boolean) => void] {
  const autosave = useSyncExternalStore(subscribe, getFileAutosave, () => true);
  const setAutosave = useCallback((next: boolean): void => {
    setFileAutosave(next);
  }, []);
  return [autosave, setAutosave];
}
