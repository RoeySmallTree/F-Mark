export interface PaneHubDeps {
  onStart(paneId: string): void;
  onStop(paneId: string): void;
}

export interface PaneHub {
  subscribe(paneId: string, listener: (chunk: string) => void): { unsubscribe(): void };
  feed(paneId: string, chunk: string): void;
  hasSubscribers(paneId: string): boolean;
}

export function createPaneHub(deps: PaneHubDeps): PaneHub {
  const subs = new Map<string, Set<(chunk: string) => void>>();
  return {
    subscribe(paneId, listener) {
      let set = subs.get(paneId);
      if (!set) {
        set = new Set();
        subs.set(paneId, set);
        deps.onStart(paneId);
      }
      set.add(listener);
      let detached = false;
      return {
        unsubscribe() {
          if (detached) return;
          detached = true;
          const current = subs.get(paneId);
          if (!current) return;
          current.delete(listener);
          if (current.size === 0) {
            subs.delete(paneId);
            deps.onStop(paneId);
          }
        },
      };
    },
    feed(paneId, chunk) {
      const set = subs.get(paneId);
      if (!set) return;
      for (const fn of set) fn(chunk);
    },
    hasSubscribers(paneId) {
      return (subs.get(paneId)?.size ?? 0) > 0;
    },
  };
}
