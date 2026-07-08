import type { SessionMeta } from "../../api/client.js";
import type { SessionBadge } from "../../lib/sessionBadge.js";

const NO_LOOSE_STRING_VALUES = {
  older: "Older",
  today: "Today",
  yesterday: "Yesterday",
  current: "__current__",
  working: "working",
  awaiting: "awaiting",
  unread: "unread",
  read: "read",
} as const;

export const SLUG_RE = /^[a-z0-9-]+$/;

export type GroupKey =
  | "Today"
  | "Yesterday"
  | "Earlier this week"
  | "This month"
  | "Older";

export const GROUP_ORDER: GroupKey[] = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "This month",
  "Older",
];

const SESSION_ORDER_STORAGE_KEY = "fmark.sessionOrderByRepo";

export type SessionOrderByRepo = Record<string, string[]>;

export interface RepoGroup {
  key: string;
  path: string | null;
  label: string;
  sessions: SessionMeta[];
  latest: string;
}

export function loadSessionOrderByRepo(): SessionOrderByRepo {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_ORDER_STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: SessionOrderByRepo = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSessionOrderByRepo(map: SessionOrderByRepo): void {
  try {
    globalThis.localStorage?.setItem(
      SESSION_ORDER_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* swallow */
  }
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function groupFor(createdIso: string, now: Date): GroupKey {
  const created = new Date(createdIso);
  if (Number.isNaN(created.getTime())) return NO_LOOSE_STRING_VALUES.older;
  const today = startOfDay(now);
  const created0 = startOfDay(created);
  const dayDiffMs = today.getTime() - created0.getTime();
  const dayDiff = Math.round(dayDiffMs / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) return NO_LOOSE_STRING_VALUES.today;
  if (dayDiff === 1) return NO_LOOSE_STRING_VALUES.yesterday;
  if (dayDiff <= 6) return "Earlier this week";
  if (
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth()
  ) {
    return "This month";
  }
  if (dayDiff <= 31) return "This month";
  return NO_LOOSE_STRING_VALUES.older;
}

export function groupSessionsByDate(
  sessions: SessionMeta[],
  now: Date,
): Map<GroupKey, SessionMeta[]> {
  const dateGroups = new Map<GroupKey, SessionMeta[]>();
  for (const key of GROUP_ORDER) dateGroups.set(key, []);
  for (const session of sessions) {
    const group = groupFor(session.created_at, now);
    dateGroups.get(group)!.push(session);
  }
  return dateGroups;
}

export function formatRelative(createdIso: string, now: Date): string {
  const created = new Date(createdIso);
  if (Number.isNaN(created.getTime())) return "";
  const diffMs = now.getTime() - created.getTime();
  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return created.toLocaleDateString();
}

export function basename(absPath: string | null | undefined): string {
  if (absPath === null || absPath === undefined || absPath.length === 0) {
    return "Current repo";
  }
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

export function sessionKey(
  session: SessionMeta,
  fallbackPath: string | null,
): string {
  return `${session.path ?? fallbackPath ?? NO_LOOSE_STRING_VALUES.current}::${session.id}`;
}

export function withFallbackPath(
  session: SessionMeta,
  fallbackPath: string | null,
): SessionMeta {
  if (session.path !== undefined || fallbackPath === null) return session;
  return { ...session, path: fallbackPath };
}

export function sortSessions(sessions: SessionMeta[]): SessionMeta[] {
  return [...sessions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

function orderedSessions(
  sessions: SessionMeta[],
  order: string[] | undefined,
): SessionMeta[] {
  if (order === undefined || order.length === 0) return sortSessions(sessions);
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...sessions].sort((a, b) => {
    const ar = rank.get(a.id);
    const br = rank.get(b.id);
    if (ar !== undefined && br !== undefined) return ar - br;
    if (ar !== undefined) return -1;
    if (br !== undefined) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

function sameSessionRoot(
  item: SessionMeta,
  target: SessionMeta,
  fallbackPath: string | null,
): boolean {
  return (
    item.id === target.id &&
    (item.path ?? fallbackPath) === (target.path ?? fallbackPath)
  );
}

export function replaceSessionInList(
  sessions: SessionMeta[],
  target: SessionMeta,
  replacement: SessionMeta,
  fallbackPath: string | null,
): SessionMeta[] {
  return sortSessions(
    sessions.map((item) =>
      sameSessionRoot(item, target, fallbackPath) ? replacement : item,
    ),
  );
}

export function removeSessionFromList(
  sessions: SessionMeta[],
  target: SessionMeta,
  fallbackPath: string | null,
): SessionMeta[] {
  return sessions.filter((item) => !sameSessionRoot(item, target, fallbackPath));
}

export function findSessionInSameRoot(
  sessions: SessionMeta[],
  target: SessionMeta,
  fallbackPath: string | null,
): SessionMeta | null {
  return (
    sessions.find(
      (item) => (item.path ?? fallbackPath) === (target.path ?? fallbackPath),
    ) ?? null
  );
}

export function reorderSessionIds(
  currentOrder: string[],
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return null;
  const from = currentOrder.indexOf(fromId);
  const to = currentOrder.indexOf(toId);
  if (from < 0 || to < 0) return null;
  const nextOrder = currentOrder.slice();
  const [moved] = nextOrder.splice(from, 1);
  if (moved === undefined) return null;
  nextOrder.splice(to, 0, moved);
  return nextOrder;
}

export function buildRepoGroups(input: {
  sessions: SessionMeta[];
  activePath: string | null;
  query: string;
  sessionOrderByRepo: SessionOrderByRepo;
}): RepoGroup[] {
  const { sessions, activePath, query, sessionOrderByRepo } = input;
  const q = query.toLowerCase().trim();
  const filtered = sessions
    .map((session) => withFallbackPath(session, activePath))
    .filter((session) => {
      if (q.length === 0) return true;
      const path = session.path ?? "";
      return (
        session.slug.toLowerCase().includes(q) ||
        basename(path).toLowerCase().includes(q) ||
        path.toLowerCase().includes(q)
      );
    });

  const byRepo = new Map<string, RepoGroup>();
  for (const session of filtered) {
    const path = session.path ?? null;
    const key = path ?? NO_LOOSE_STRING_VALUES.current;
    const existing = byRepo.get(key);
    if (existing) {
      existing.sessions.push(session);
      if (session.created_at > existing.latest) existing.latest = session.created_at;
    } else {
      byRepo.set(key, {
        key,
        path,
        label: basename(path),
        sessions: [session],
        latest: session.created_at,
      });
    }
  }

  return [...byRepo.values()]
    .map((repo) => ({
      ...repo,
      sessions: orderedSessions(repo.sessions, sessionOrderByRepo[repo.key]),
    }))
    .sort((a, b) => {
      if (a.path === activePath && b.path !== activePath) return -1;
      if (b.path === activePath && a.path !== activePath) return 1;
      return b.latest.localeCompare(a.latest);
    });
}

export function isSessionActive(
  session: SessionMeta,
  currentSessionId: string | null,
  activePath: string | null,
): boolean {
  return (
    session.id === currentSessionId &&
    (session.path === undefined ||
      activePath === null ||
      session.path === activePath)
  );
}

export function beaconState(
  badge: SessionBadge,
): "working" | "awaiting" | "unread" | "read" {
  switch (badge) {
    case "working":
      return NO_LOOSE_STRING_VALUES.working;
    case "awaiting input":
      return NO_LOOSE_STRING_VALUES.awaiting;
    case "done unread":
      return NO_LOOSE_STRING_VALUES.unread;
    case "done read":
      return NO_LOOSE_STRING_VALUES.read;
  }
}
