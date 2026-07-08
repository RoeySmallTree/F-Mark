import type { AnyEventRecord } from "@f-mark/shared";

const CACHE_CAP = 8;
const cache = new Map<string, AnyEventRecord[]>();

export function getCachedEvents(baseKey: string): AnyEventRecord[] | undefined {
  const events = cache.get(baseKey);
  if (events === undefined) return undefined;
  touch(baseKey);
  return [...events];
}

export function setCachedEvents(
  baseKey: string,
  events: AnyEventRecord[],
): void {
  cache.delete(baseKey);
  cache.set(baseKey, [...events]);
  while (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function touch(baseKey: string): void {
  const events = cache.get(baseKey);
  if (events === undefined) return;
  cache.delete(baseKey);
  cache.set(baseKey, events);
}

export function clearSessionEventsCache(): void {
  cache.clear();
}
