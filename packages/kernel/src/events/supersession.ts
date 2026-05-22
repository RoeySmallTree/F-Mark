import type { AnyEventRecord } from "@f-mark/shared";

export function applySupersession(events: AnyEventRecord[]): AnyEventRecord[] {
  const superseded = new Set<string>();
  for (const e of events) {
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string") superseded.add(sup);
  }
  return events.filter((e) => !superseded.has(e.filename));
}
