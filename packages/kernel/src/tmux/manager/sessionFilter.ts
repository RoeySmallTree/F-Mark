import { isFmarkSessionName, parseFmarkSessionName } from "../naming.js";

export interface ListedFmarkSession {
  sessionName: string;
  kind: "agent" | "terminal";
  participantId?: string;
  index?: number;
  lastActivityAt?: string;
}

interface SessionListEntry {
  sessionName: string;
  lastActivityAt?: string;
}

export function parseTmuxSessionListLine(line: string): SessionListEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  // Separator is "|" (tmux mangles a literal tab in -F output to "_").
  const splitAt = trimmed.lastIndexOf("|");
  const sessionName = splitAt === -1 ? trimmed : trimmed.slice(0, splitAt);
  const activityRaw = splitAt === -1 ? undefined : trimmed.slice(splitAt + 1);
  if (sessionName === undefined || sessionName.length === 0) return null;
  if (activityRaw === undefined || activityRaw.length === 0) {
    return { sessionName };
  }
  const seconds = Number(activityRaw);
  if (!Number.isFinite(seconds) || seconds <= 0) return { sessionName };
  return {
    sessionName,
    lastActivityAt: new Date(seconds * 1000).toISOString(),
  };
}

export function parseFmarkSessionList(stdout: string): SessionListEntry[] {
  return stdout
    .split("\n")
    .map(parseTmuxSessionListLine)
    .filter((s): s is SessionListEntry => s !== null)
    .filter((s) => isFmarkSessionName(s.sessionName));
}

export function toListedFmarkSession(
  entry: SessionListEntry,
): ListedFmarkSession | null {
  const parsed = parseFmarkSessionName(entry.sessionName);
  if (!parsed) return null;
  return {
    sessionName: entry.sessionName,
    ...parsed,
    ...(entry.lastActivityAt !== undefined
      ? { lastActivityAt: entry.lastActivityAt }
      : {}),
  };
}
