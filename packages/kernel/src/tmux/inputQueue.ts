// packages/kernel/src/tmux/inputQueue.ts
export interface InputQueue {
  enqueue<T>(paneKey: string, task: () => Promise<T>): Promise<T>;
}

export function createInputQueue(): InputQueue {
  const tails = new Map<string, Promise<unknown>>();
  return {
    enqueue<T>(paneKey: string, task: () => Promise<T>): Promise<T> {
      const prev = tails.get(paneKey) ?? Promise.resolve();
      const next = prev.then(() => task(), () => task());
      tails.set(paneKey, next.catch(() => undefined));
      return next as Promise<T>;
    },
  };
}
