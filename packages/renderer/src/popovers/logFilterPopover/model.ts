import type { Participant } from "@f-mark/shared";
import type { Dispatch, SetStateAction } from "react";
import type { LogFilter, LogFilterRange } from "../log-filter-types.js";

export const RANGE_OPTIONS: { id: LogFilterRange; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "custom", label: "Custom" },
];

export type ParticipantEntry = [string, Participant];

export type SetLogFilterDraft = Dispatch<SetStateAction<LogFilter>>;

export function toggleString(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return [...list, value];
}
