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

import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
  SearchHit,
} from "@f-mark/shared";
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

export type CmdkKind = "session" | "named" | "search" | "agent" | "action";

export interface CmdkRowSession {
  id: string;
  kind: "session";
  label: string;
  sub: string;
  icon: CmdkIcon;
  sessionId: string;
  path?: string;
}

export interface CmdkRowNamed {
  id: string;
  kind: "named";
  label: string;
  sub: string;
  icon: CmdkIcon;
  filename: string;
  sessionId: string;
  path?: string;
}

export interface CmdkRowSearch {
  id: string;
  kind: "search";
  label: string;
  sub: string;
  icon: CmdkIcon;
  filename: string;
  sessionId: string;
  path?: string;
}

export interface CmdkRowAgent {
  id: string;
  kind: "agent";
  label: string;
  sub: string;
  icon: CmdkIcon;
  participantId: string;
  sessionId?: string;
  path?: string;
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
  | CmdkRowAgent
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

function basename(absPath: string | undefined): string {
  if (absPath === undefined || absPath.length === 0) return "current repo";
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) || trimmed : trimmed;
}

function sessionSub(s: SessionMeta): string {
  const date = new Date(s.created_at).toLocaleDateString();
  return s.path === undefined ? date : `${basename(s.path)} / ${date}`;
}

/** Build the empty-query default groups: Recent sessions + Quick actions. */
export function defaultGroups(sessions: SessionMeta[]): CmdkGroup[] {
  const recent = [...sessions]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6)
    .map(
      (s): CmdkRowSession => ({
        id: `session:${s.path ?? "current"}:${s.id}`,
        kind: "session",
        label: s.slug,
        sub: sessionSub(s),
        icon: "Folder",
        sessionId: s.id,
        path: s.path,
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
  named?: Array<{
    event: AnyEventRecord;
    name: string;
    path?: string;
    session: SessionMeta;
  }>;
  agents?: Array<{
    participantId: string;
    participant: Participant & { active_session?: string | null };
    path?: string;
    session?: SessionMeta;
  }>;
}

type NamedSearchItem = NonNullable<QueryGroupsInput["named"]>[number];

export function queryGroups(input: QueryGroupsInput): CmdkGroup[] {
  const { query, sessions, events, searchHits, currentSessionId, agents = [] } =
    input;
  const q = query.trim();
  if (q.length === 0) return defaultGroups(sessions);

  const groups: CmdkGroup[] = [];

  // 1) Sessions by slug fuzzy match.
  const sessionRows = fuzzyFilter(sessions, q, (s) => s.slug)
    .slice(0, 8)
    .map(
      (s): CmdkRowSession => ({
        id: `session:${s.path ?? "current"}:${s.id}`,
        kind: "session",
        label: s.slug,
        sub: sessionSub(s),
        icon: "Folder",
        sessionId: s.id,
        path: s.path,
      }),
    );
  if (sessionRows.length > 0) {
    groups.push({ key: "sessions", label: "Sessions", rows: sessionRows });
  }

  // 2) Named contributions.
  const namedItems: NamedSearchItem[] =
    input.named ??
    (currentSessionId !== null
      ? aggregate(events).named.map((ev) => ({
          event: ev,
          name: (ev.payload as ProsePayload).name ?? "",
          session: sessions.find((s) => s.id === currentSessionId) ?? {
            id: currentSessionId,
            slug: currentSessionId,
            created_at: "",
          },
          path: undefined,
        }))
      : []);
  const namedRows = fuzzyFilter(namedItems, q, (it) => it.name)
      .slice(0, 8)
      .map(
        (it): CmdkRowNamed => ({
          id: `named:${it.path ?? "current"}:${it.session.id}:${
            it.event.filename
          }`,
          kind: "named",
          label: it.name || "(untitled)",
          sub: truncate(
            `${
              it.path !== undefined ? `${basename(it.path)} / ` : ""
            }${it.session.slug} - ${
              (it.event.payload as ProsePayload).content ?? ""
            }`,
            72,
          ),
          icon: "FileText",
          filename: it.event.filename,
          sessionId: it.session.id,
          path: it.path,
        }),
      );
  if (namedRows.length > 0) {
    groups.push({
      key: "named",
      label: "Named contributions",
      rows: namedRows,
    });
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
      sub: `${h.path !== undefined ? `${basename(h.path)} / ` : ""}${
        h.session_slug ?? h.session_id
      } - ${truncate(h.snippet, 80)}`,
      icon: "Search",
      filename: h.event.filename,
      sessionId: h.session_id,
      path: h.path,
    };
  });
  if (searchRows.length > 0) {
    groups.push({ key: "search", label: "Search results", rows: searchRows });
  }

  const agentRows = fuzzyFilter(
    agents,
    q,
    (a) => `${a.participant.name} ${a.participantId} ${a.path ?? ""}`,
  )
    .slice(0, 8)
    .map(
      (a): CmdkRowAgent => ({
        id: `agent:${a.path ?? "current"}:${a.participantId}`,
        kind: "agent",
        label: a.participant.name,
        sub: `${a.path !== undefined ? `${basename(a.path)} / ` : ""}${
          a.session?.slug ?? a.participant.active_session ?? "no active session"
        }`,
        icon: "Zap",
        participantId: a.participantId,
        sessionId: a.participant.active_session ?? undefined,
        path: a.path,
      }),
    );
  if (agentRows.length > 0) {
    groups.push({ key: "agents", label: "Agents", rows: agentRows });
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
