import type { LogFilter, LogFilterRange } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
  today: "today",
} as const;

export interface RangeBounds {
  start: Date | null;
  end: Date | null;
}

const RELATIVE_RANGE_DAYS: Partial<Record<LogFilterRange, number>> = {
  "7d": 7,
  "30d": 30,
};

export function rangeBounds(
  filter: LogFilter,
  now: Date = new Date(),
): RangeBounds {
  if (filter.range === NO_LOOSE_STRING_VALUES.all) return emptyRangeBounds();
  if (filter.range === NO_LOOSE_STRING_VALUES.today) return { start: startOfToday(now), end: null };
  const relativeDays = RELATIVE_RANGE_DAYS[filter.range];
  if (relativeDays !== undefined) {
    return { start: dateDaysBefore(now, relativeDays), end: null };
  }
  return customRangeBounds(filter);
}

function emptyRangeBounds(): RangeBounds {
  return { start: null, end: null };
}

function startOfToday(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function dateDaysBefore(now: Date, days: number): Date {
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return start;
}

function customRangeBounds(filter: LogFilter): RangeBounds {
  return {
    start: validCustomDate(filter.customStart),
    end: validCustomDate(filter.customEnd),
  };
}

function validCustomDate(value: string | undefined): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
