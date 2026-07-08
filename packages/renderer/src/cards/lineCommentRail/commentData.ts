import type { AnyEventRecord, Participant, ProsePayload } from "@f-mark/shared";
import { getCommentTarget } from "@f-mark/shared";
import {
  createChainRootResolver,
  isMarkerEvent,
  resolvedChainRootsFromComments,
} from "../../comments/commentMarkers.js";
import {
  lineKey,
  normalizeLines,
  type LineRange,
} from "./lineGeometry.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

export interface AnchorGroup {
  key: string;
  lines: LineRange;
  comments: AnyEventRecord[];
  color: string;
  resolved: boolean;
}

export function payloadContent(event: AnyEventRecord): string {
  return ((event.payload as ProsePayload).content ?? "").trim();
}

export function buildAnchorGroups(
  comments: AnyEventRecord[],
  participants: Record<string, Participant>,
  lineCount: number,
): AnchorGroup[] {
  const byFilename = new Map(comments.map((comment) => [comment.filename, comment]));
  const chainRoot = createChainRootResolver(byFilename);
  const resolvedRoots = resolvedChainRootsFromComments(comments, chainRoot);
  const byLine = new Map<string, AnchorGroup>();
  for (const c of comments) {
    if (isMarkerEvent(c)) continue;
    const ct = getCommentTarget(c.payload as ProsePayload);
    const lines = normalizeLines(ct?.lines, lineCount);
    const key = lineKey(lines);
    const participant = participants[c.participant_id];
    const color =
      participant?.color ??
      (participant?.kind === NO_LOOSE_STRING_VALUES.agent ? "var(--agent)" : "var(--user)");
    const rootResolved = resolvedRoots.has(chainRoot(c.filename));
    const existing = byLine.get(key);
    if (existing !== undefined) {
      existing.comments.push(c);
      existing.resolved = existing.resolved || rootResolved;
    } else {
      byLine.set(key, {
        key,
        lines,
        comments: [c],
        color,
        resolved: rootResolved,
      });
    }
  }
  return [...byLine.values()].sort((a, b) => a.lines[0] - b.lines[0]);
}
