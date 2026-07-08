import type { EventKind } from "@f-mark/shared";

export type LogFilterRange = "all" | "today" | "7d" | "30d" | "custom";

export interface LogFilter {
  kinds: string[];
  participants: string[];
  range: LogFilterRange;
  customStart?: string;
  customEnd?: string;
  namedOnly: boolean;
}

export const DEFAULT_FILTER: LogFilter = {
  kinds: [],
  participants: [],
  range: "all",
  namedOnly: false,
};

export const FILTERABLE_KINDS: readonly EventKind[] = [
  "prose",
  "choices",
  "choice",
  "turn-end",
  "todo",
  "html",
  "file",
  "tool-use",
  "subagent-run",
  "subagent-output",
  "access-request",
  "access-response",
  "flow",
  "fork-link",
];
