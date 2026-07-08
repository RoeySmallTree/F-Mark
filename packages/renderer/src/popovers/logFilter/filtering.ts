import type { AnyEventRecord } from "@f-mark/shared";
import { LogFilterEvaluator } from "./evaluator.js";
import type { LogFilter } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
} as const;

export function hasActiveFilter(filter: LogFilter): boolean {
  return (
    filter.kinds.length > 0 ||
    filter.participants.length > 0 ||
    filter.range !== NO_LOOSE_STRING_VALUES.all ||
    filter.namedOnly
  );
}

export function activeFilterCount(filter: LogFilter): number {
  let count = 0;
  if (filter.kinds.length > 0) count += filter.kinds.length;
  if (filter.participants.length > 0) count += filter.participants.length;
  if (filter.range !== NO_LOOSE_STRING_VALUES.all) count += 1;
  if (filter.namedOnly) count += 1;
  return count;
}

export function applyFilter(
  events: AnyEventRecord[],
  filter: LogFilter,
  now: Date = new Date(),
): AnyEventRecord[] {
  const evaluator = new LogFilterEvaluator(filter, now);
  return events.filter((event) => evaluator.matches(event));
}
