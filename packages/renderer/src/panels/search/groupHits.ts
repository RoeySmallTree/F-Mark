import type { SearchHit } from "@f-mark/shared";
import type { SearchPathGroup, SearchSessionGroup } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  current: "current",
} as const;

export function groupSearchHits(hits: SearchHit[]): SearchPathGroup[] {
  const sessions = groupHitsBySession(hits);
  return groupSessionsByPath(sessions);
}

function groupHitsBySession(hits: SearchHit[]): SearchSessionGroup[] {
  const groups: SearchSessionGroup[] = [];
  for (const hit of hits) {
    const key = `${hit.path ?? NO_LOOSE_STRING_VALUES.current}:${hit.session_id}`;
    const existing = groups.find((group) => group.key === key);
    if (existing !== undefined) {
      existing.hits.push(hit);
    } else {
      groups.push({
        key,
        path: hit.path,
        session: hit.session_slug ?? hit.session_id,
        hits: [hit],
      });
    }
  }
  return groups;
}

function groupSessionsByPath(
  sessionGroups: SearchSessionGroup[],
): SearchPathGroup[] {
  const groups: SearchPathGroup[] = [];
  for (const sessionGroup of sessionGroups) {
    const key = sessionGroup.path ?? NO_LOOSE_STRING_VALUES.current;
    const existing = groups.find((group) => group.key === key);
    if (existing !== undefined) {
      existing.sessions.push(sessionGroup);
    } else {
      groups.push({ key, path: sessionGroup.path, sessions: [sessionGroup] });
    }
  }
  return groups;
}
