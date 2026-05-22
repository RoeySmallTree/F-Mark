/**
 * Command Palette sources — the pure functions that build result rows.
 *
 * The palette has 4 result kinds:
 *   - 'session'        — switch to a session (data: session id)
 *   - 'named'          — scroll to a named contribution in the current session
 *                        (data: event filename)
 *   - 'search'         — search hit from the backend (data: session id + filename)
 *   - 'action'         — quick action (run the action() callback)
 *
 * Each row carries a stable `id`, a human label/sub, an `icon` key (resolved
 * to a real Lucide icon at render time), a `kind` badge, and the payload
 * needed to perform the action. The CmdKModal component composes these into
 * the visible list and handles selection state + keyboard navigation.
 */

import type { AnyEventRecord, ProsePayload, SearchHit } from "@f-mark/shared";
import type { SessionMeta } from "../../api/client.js";
import { aggregate } from "../../state/aggregate.js";
import { fuzzyFilter } from "./fuzzy.js";

export type CmdkIcon =
  | "Folder"
  | "FileText"
  | "Search"
  | "Plus"
  | "Settings"
  | "Sun"
  | "Terminal"
  | "Code"
  | "Sunrise"
  | "Square"
  | "Zap";

export type CmdkKind = "session" | "named" | "search" | "action";

export interface CmdkRowSession {
  id: string;
  kind: "session";
  label: string;
  sub: string;
  icon: CmdkIcon;
  sessionId: string;
}

export interface CmdkRowNamed {
  id: string;
  kind: "named";
  label: string;
  sub: string;
  icon: CmdkIcon;
  filename: string;
  sessionId: string;
}

export interface CmdkRowSearch {
  id: string;
  kind: "search";
  label: string;
  sub: string;
  icon: CmdkIcon;
  filename: string;
  sessionId: string;
}

export interface CmdkRowAction {
  id: string;
  kind: "action";
  label: string;
  sub: string;
  icon: CmdkIcon;
  actionId: string;
}

export type CmdkRow =
  | CmdkRowSession
  | CmdkRowNamed
  | CmdkRowSearch
  | CmdkRowAction;

export interface CmdkGroup {
  key: string;
  label: string;
  rows: CmdkRow[];
}

export interface QuickAction {
  id: string;
  label: string;
  sub: string;
  icon: CmdkIcon;
}

/**
 * Static list of quick actions. The CmdKModal binds `actionId` → callback at
 * render time (so `applyTheme`, `openModal`, etc. can be injected with the
 * right closures). Keeping the list pure makes it easy to test.
 */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-session",
    label: "New session",
    sub: "Create a fresh session",
    icon: "Plus",
  },
  {
    id: "settings",
    label: "Open settings",
    sub: "Profile, agents, appearance, shortcuts",
    icon: "Settings",
  },
  {
    id: "theme-light",
    label: "Theme: Light",
    sub: "Warm paper canvas — the default daytime look",
    icon: "Sun",
  },
  {
    id: "theme-terminal",
    label: "Theme: Terminal",
    sub: "Phosphor green on near-black",
    icon: "Terminal",
  },
  {
    id: "theme-ide",
    label: "Theme: IDE Dark",
    sub: "GitHub-style cool greys",
    icon: "Code",
  },
  {
    id: "theme-solarized",
    label: "Theme: Solarized",
    sub: "Classic Solarized Dark",
    icon: "Sunrise",
  },
  {
    id: "theme-brutalist",
    label: "Theme: Brutalist",
    sub: "Pure black & white, monospace, zero radius",
    icon: "Square",
  },
  {
    id: "theme-cyber",
    label: "Theme: Cyberpunk",
    sub: "Deep purple with cyan/magenta neon",
    icon: "Zap",
  },
];

/** Truncate a string to a maximum length, appending an ellipsis if cut. */
function truncate(text: string, max = 96): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Build the empty-query default groups: Recent sessions + Quick actions. */
export function defaultGroups(sessions: SessionMeta[]): CmdkGroup[] {
  const recent = [...sessions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6)
    .map(
      (s): CmdkRowSession => ({
        id: `session:${s.id}`,
        kind: "session",
        label: s.slug,
        sub: new Date(s.created_at).toLocaleDateString(),
        icon: "Folder",
        sessionId: s.id,
      }),
    );

  const actions = QUICK_ACTIONS.slice(0, 4).map(
    (a): CmdkRowAction => ({
      id: `action:${a.id}`,
      kind: "action",
      label: a.label,
      sub: a.sub,
      icon: a.icon,
      actionId: a.id,
    }),
  );

  const groups: CmdkGroup[] = [];
  if (recent.length > 0) {
    groups.push({ key: "recent-sessions", label: "Recent sessions", rows: recent });
  }
  groups.push({ key: "quick-actions", label: "Quick actions", rows: actions });
  return groups;
}

/** Build query-driven groups: sessions, named, search hits, quick actions. */
export interface QueryGroupsInput {
  query: string;
  sessions: SessionMeta[];
  events: AnyEventRecord[];
  searchHits: SearchHit[];
  currentSessionId: string | null;
}

export function queryGroups(input: QueryGroupsInput): CmdkGroup[] {
  const { query, sessions, events, searchHits, currentSessionId } = input;
  const q = query.trim();
  if (q.length === 0) return defaultGroups(sessions);

  const groups: CmdkGroup[] = [];

  // 1) Sessions by slug fuzzy match.
  const sessionRows = fuzzyFilter(sessions, q, (s) => s.slug)
    .slice(0, 8)
    .map(
      (s): CmdkRowSession => ({
        id: `session:${s.id}`,
        kind: "session",
        label: s.slug,
        sub: new Date(s.created_at).toLocaleDateString(),
        icon: "Folder",
        sessionId: s.id,
      }),
    );
  if (sessionRows.length > 0) {
    groups.push({ key: "sessions", label: "Sessions", rows: sessionRows });
  }

  // 2) Named contributions in the current session.
  if (currentSessionId !== null) {
    const namedEvents = aggregate(events).named;
    const namedItems = namedEvents.map((ev) => ({
      ev,
      name: (ev.payload as ProsePayload).name ?? "",
    }));
    const namedRows = fuzzyFilter(namedItems, q, (it) => it.name)
      .slice(0, 8)
      .map(
        (it): CmdkRowNamed => ({
          id: `named:${it.ev.filename}`,
          kind: "named",
          label: it.name || "(untitled)",
          sub: truncate(
            (it.ev.payload as ProsePayload).content ?? "",
            72,
          ),
          icon: "FileText",
          filename: it.ev.filename,
          sessionId: currentSessionId,
        }),
      );
    if (namedRows.length > 0) {
      groups.push({
        key: "named",
        label: "Named contributions",
        rows: namedRows,
      });
    }
  }

  // 3) Backend search results.
  const searchRows = searchHits.slice(0, 10).map((h): CmdkRowSearch => {
    const payload = h.event.payload as Partial<ProsePayload>;
    const labelBase =
      payload.name ?? `${h.event.kind} · ${h.event.filename.slice(0, 24)}`;
    return {
      id: `search:${h.session_id}:${h.event.filename}`,
      kind: "search",
      label: labelBase,
      sub: truncate(h.snippet, 80),
      icon: "Search",
      filename: h.event.filename,
      sessionId: h.session_id,
    };
  });
  if (searchRows.length > 0) {
    groups.push({ key: "search", label: "Search results", rows: searchRows });
  }

  // 4) Quick actions matching the query.
  const actionRows = fuzzyFilter(QUICK_ACTIONS, q, (a) => `${a.label} ${a.sub}`)
    .slice(0, 8)
    .map(
      (a): CmdkRowAction => ({
        id: `action:${a.id}`,
        kind: "action",
        label: a.label,
        sub: a.sub,
        icon: a.icon,
        actionId: a.id,
      }),
    );
  if (actionRows.length > 0) {
    groups.push({ key: "quick-actions", label: "Quick actions", rows: actionRows });
  }

  return groups;
}

/** Flatten groups into a single ordered row list (for arrow-key navigation). */
export function flattenRows(groups: CmdkGroup[]): CmdkRow[] {
  const out: CmdkRow[] = [];
  for (const g of groups) for (const r of g.rows) out.push(r);
  return out;
}
