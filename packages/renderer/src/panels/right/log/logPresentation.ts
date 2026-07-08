import {
  CheckSquare,
  FileCode2,
  Flag,
  GitFork,
  ListChecks,
  MousePointerClick,
  Paperclip,
  ShieldAlert,
  Text,
  Workflow,
  Wrench,
} from "lucide-react";
import type { EventKind } from "@f-mark/shared";

/* Lucide icon per event kind. Picks something semantically grounded — no
   abstract glyphs that the reader would have to decode. */
export const KIND_ICON: Record<EventKind, typeof Text> = {
  prose: Text,
  choices: ListChecks,
  choice: MousePointerClick,
  "turn-end": Flag,
  todo: CheckSquare,
  html: FileCode2,
  file: Paperclip,
  "tool-use": Wrench,
  "subagent-run": Workflow,
  "subagent-output": Text,
  flow: Workflow,
  "access-request": ShieldAlert,
  "access-response": ShieldAlert,
  "fork-link": GitFork,
};

export const KIND_LABEL: Record<EventKind, string> = {
  prose: "prose",
  choices: "choices",
  choice: "choice",
  "turn-end": "turn end",
  todo: "todo",
  html: "html",
  file: "file",
  "tool-use": "tool use",
  "subagent-run": "sub-agent",
  "subagent-output": "sub-agent output",
  flow: "flow",
  "access-request": "access request",
  "access-response": "access response",
  "fork-link": "fork",
};

export function formatLogTimestamp(timestamp: string): string {
  /* Compact ISO ("20260522T101530Z") and standard ISO both supported. */
  let iso = timestamp;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(
    timestamp,
  );
  if (match !== null) {
    iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return timestamp;
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
