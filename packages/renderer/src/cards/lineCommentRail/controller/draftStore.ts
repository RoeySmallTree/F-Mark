import type { ProseMention } from "@f-mark/shared";
import {
  lineKey,
  type LineRange,
} from "../lineGeometry.js";

export function savedDraftsAfterClear(
  savedDrafts: Record<string, string>,
  lines: LineRange,
): Record<string, string> {
  const next = { ...savedDrafts };
  delete next[lineKey(lines)];
  return next;
}

export function savedDraftsAfterPersist(
  savedDrafts: Record<string, string>,
  lines: LineRange,
  value: string,
): Record<string, string> {
  const next = { ...savedDrafts };
  const key = lineKey(lines);
  if (value.trim().length === 0) delete next[key];
  else next[key] = value;
  return next;
}

export function toggleMentionSelection(
  mentions: ProseMention[],
  mention: ProseMention,
): ProseMention[] {
  return mentions.some((m) => m.participant_id === mention.participant_id)
    ? mentions.filter((m) => m.participant_id !== mention.participant_id)
    : [...mentions, mention];
}
