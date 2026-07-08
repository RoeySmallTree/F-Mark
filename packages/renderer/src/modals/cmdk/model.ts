import type { AnyEventRecord, SearchHit } from "@f-mark/shared";
import type {
  SessionEventGroup,
  SessionMeta,
} from "../../api/client.js";
import {
  defaultGroups,
  flattenRows,
  queryGroups,
  type CmdkGroup,
  type CmdkRow,
} from "./sources.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  prose: "prose",
} as const;

type CmdKAgentRowSource = {
  participantId: string;
  participant: SessionEventGroup["participants"][string];
  path?: string;
  session?: SessionMeta;
};

type CmdKNamedRowSource = {
  event: SessionEventGroup["events"][number];
  name: string;
  path?: string;
  session: SessionMeta;
};

interface CmdKPaletteModelInput {
  allEventGroups: SessionEventGroup[];
  allSessions: SessionMeta[];
  currentSessionId: string | null;
  events: AnyEventRecord[];
  query: string;
  searchHits: SearchHit[];
  sessions: SessionMeta[];
}

interface CmdKPaletteModel {
  flatRows: CmdkRow[];
  groups: CmdkGroup[];
}

function buildAgentRows(
  allEventGroups: SessionEventGroup[],
): CmdKAgentRowSource[] {
  const rows: CmdKAgentRowSource[] = [];
  const seen = new Set<string>();
  for (const group of allEventGroups) {
    for (const [participantId, participant] of Object.entries(
      group.participants,
    )) {
      if (participant.kind !== NO_LOOSE_STRING_VALUES.agent) continue;
      const key = `${group.path}:${participantId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        participantId,
        participant,
        path: group.path,
        session: group.session,
      });
    }
  }
  return rows;
}

function buildNamedRows(
  allEventGroups: SessionEventGroup[],
): CmdKNamedRowSource[] {
  const rows: CmdKNamedRowSource[] = [];
  for (const group of allEventGroups) {
    for (const event of group.events) {
      if (event.kind !== NO_LOOSE_STRING_VALUES.prose) continue;
      const payload = event.payload as { name?: unknown };
      if (typeof payload.name !== "string" || payload.name.length === 0) {
        continue;
      }
      rows.push({
        event,
        name: payload.name,
        path: group.path,
        session: group.session,
      });
    }
  }
  return rows;
}

export function buildCmdKPaletteModel(
  input: CmdKPaletteModelInput,
): CmdKPaletteModel {
  const sessionsForPalette =
    input.allSessions.length > 0 ? input.allSessions : input.sessions;
  const namedRows = buildNamedRows(input.allEventGroups);
  const agentRows = buildAgentRows(input.allEventGroups);
  const query = input.query.trim();
  const groups =
    query.length === 0
      ? defaultGroups(sessionsForPalette)
      : queryGroups({
          query,
          sessions: sessionsForPalette,
          events: input.events,
          searchHits: input.searchHits,
          currentSessionId: input.currentSessionId,
          named: namedRows.length > 0 ? namedRows : undefined,
          agents: agentRows,
        });

  return { groups, flatRows: flattenRows(groups) };
}
