import type { ManagedAgentRootBinding } from "../types.js";

export class ResumeLockRegistry {
  private readonly locks = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.locks.set(key, chained);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }
}

export function resumeLockKeyFor(
  binding: ManagedAgentRootBinding,
  participantId: string,
): string {
  const rootKey = binding.pathId ?? binding.tmuxRoot ?? "";
  return `${rootKey}::${participantId}`;
}
