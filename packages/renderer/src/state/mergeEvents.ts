import { normalizeTimestampForSort, type AnyEventRecord } from "@f-mark/shared";

function compareEvents(a: AnyEventRecord, b: AnyEventRecord): number {
  const timestamp = normalizeTimestampForSort(a.timestamp).localeCompare(
    normalizeTimestampForSort(b.timestamp),
  );
  return timestamp !== 0 ? timestamp : a.filename.localeCompare(b.filename);
}

export function mergeEvents(
  current: AnyEventRecord[],
  delta: AnyEventRecord[],
): AnyEventRecord[] {
  const byFilename = new Map<string, AnyEventRecord>();
  for (const event of current) byFilename.set(event.filename, event);
  for (const event of delta) byFilename.set(event.filename, event);
  return [...byFilename.values()].sort(compareEvents);
}
