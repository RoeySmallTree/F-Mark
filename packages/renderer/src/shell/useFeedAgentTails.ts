import { useMemo } from "react";
import {
  EVENT_KINDS,
  PARTICIPANT_KINDS,
  type AnyEventRecord,
  type ManagedAgent,
  type Participant,
  type ToolUsePayload,
} from "@f-mark/shared";
import {
  accessRequestOpen,
  pendingAccessCountForParticipant,
} from "../cards/AccessRequestCard.js";
import { useOptionalAgentSpawnContext } from "../hooks/useAgentSpawn.js";
import type { ConnectingAgent } from "../hooks/useAgentSpawn.js";
import {
  agentHasClosedCurrentTurn,
  agentHasOpenTurnActivity,
  agentHasPendingUserTurn,
  agentLooksActive,
} from "../lib/agentActivity.js";
import {
  approvalPauseClock,
  eventTimestampMs,
} from "../lib/approvalPauseClock.js";
import type { AgentPresence } from "../state/presence.js";
import type { ViewMode } from "../state/store.js";

const EMPTY_CONNECTING_AGENTS: ConnectingAgent[] = [];

const feedViewModes = {
  document: "document",
} as const;

const tailKeyParts = {
  running: "running",
  connecting: "connecting",
  unknown: "unknown",
  empty: "",
} as const;

const participantPrefixes = {
  user: "us",
} as const;

const activityLabels = {
  thinking: "is thinking",
  file: "is sharing a file",
  plan: "is updating the plan",
  flow: "is drawing a diagram",
  html: "is rendering a preview",
  question: "is asking a question",
  subAgent: "is running a sub-agent",
  access: "is requesting access",
  command: "is running a command",
  read: "is reading a file",
  edit: "is editing files",
  search: "is searching the code",
  web: "is browsing the web",
  tools: "is using tools",
} as const;

export interface FeedAgentTails {
  activeAgentIds: Set<string>;
  activeAgentIdList: string[];
  turnStartMs: number | null;
  agentAction: string;
  approvalClock: ReturnType<typeof approvalPauseClock>;
  runningTailBlocked: boolean;
  showRunningTail: boolean;
  connectingAgentsForSession: ConnectingAgent[];
  connectingSnapshots: Record<string, Participant>;
  connectingTurnStartMs: number | null;
  showConnectingTail: boolean;
  runningTailKey: string;
  connectingTailKey: string;
}

export function useFeedAgentTails({
  events,
  participants,
  currentSessionId,
  viewMode,
  presence,
  managedAgents,
}: {
  events: AnyEventRecord[];
  participants: Record<string, Participant>;
  currentSessionId: string | null;
  viewMode: ViewMode;
  presence: Record<string, AgentPresence>;
  managedAgents: ManagedAgent[];
}): FeedAgentTails {
  const agentSpawn = useOptionalAgentSpawnContext();
  const connectingAgents =
    agentSpawn?.connectingAgents ?? EMPTY_CONNECTING_AGENTS;

  const managedAgentsById = useMemo(
    () => new Map(managedAgents.map((agent) => [agent.participant_id, agent])),
    [managedAgents],
  );

  const activeAgentIds = useMemo(
    () =>
      collectRunnableAgentIds({
        events,
        participants,
        currentSessionId,
        presence,
        managedAgentsById,
      }),
    [events, participants, currentSessionId, presence, managedAgentsById],
  );
  const activeAgentIdList = useMemo(
    () => [...activeAgentIds],
    [activeAgentIds],
  );
  const turnStartMs = useMemo(() => turnStartMsOf(events), [events]);
  const agentAction = useMemo(
    () => describeAgentActivity(events, activeAgentIds),
    [events, activeAgentIds],
  );
  const approvalClock = useMemo(
    () =>
      approvalPauseClock(events, {
        participantIds: activeAgentIds,
        sinceMs: turnStartMs,
      }),
    [events, activeAgentIds, turnStartMs],
  );
  const runningTailBlocked = useMemo(
    () =>
      activeAgentIdList.some(
        (id) => pendingAccessCountForParticipant(id, events) > 0,
      ),
    [activeAgentIdList, events],
  );
  const showRunningTail =
    viewMode !== feedViewModes.document && activeAgentIds.size > 0;

  const connectingAgentsForSession = useMemo(
    () =>
      filterConnectingAgents(
        connectingAgents,
        currentSessionId,
        activeAgentIds,
      ),
    [connectingAgents, currentSessionId, activeAgentIds],
  );
  const connectingSnapshots = useMemo(
    () => connectingParticipantSnapshots(connectingAgentsForSession),
    [connectingAgentsForSession],
  );
  const connectingTurnStartMs = useMemo(
    () => earliestConnectingStart(connectingAgentsForSession),
    [connectingAgentsForSession],
  );
  const showConnectingTail =
    viewMode !== feedViewModes.document && connectingAgentsForSession.length > 0;

  return {
    activeAgentIds,
    activeAgentIdList,
    turnStartMs,
    agentAction,
    approvalClock,
    runningTailBlocked,
    showRunningTail,
    connectingAgentsForSession,
    connectingSnapshots,
    connectingTurnStartMs,
    showConnectingTail,
    runningTailKey: showRunningTail
      ? `${tailKeyParts.running}:${sortedIds(activeAgentIdList)}:${turnStartMs ?? tailKeyParts.unknown}:${agentAction}`
      : tailKeyParts.empty,
    connectingTailKey: showConnectingTail
      ? `${tailKeyParts.connecting}:${sortedIds(
          connectingAgentsForSession.map((agent) => agent.participantId),
        )}`
      : tailKeyParts.empty,
  };
}

function collectRunnableAgentIds({
  events,
  participants,
  currentSessionId,
  presence,
  managedAgentsById,
}: {
  events: AnyEventRecord[];
  participants: Record<string, Participant>;
  currentSessionId: string | null;
  presence: Record<string, AgentPresence>;
  managedAgentsById: Map<string, ManagedAgent>;
}): Set<string> {
  const ids = new Set<string>();
  if (currentSessionId === null) return ids;
  for (const [id, participant] of Object.entries(participants)) {
    if (!isAgentForSession(participant, currentSessionId)) continue;
    if (agentIsRunnable(id, events, presence, managedAgentsById)) {
      ids.add(id);
    }
  }
  return ids;
}

function isAgentForSession(
  participant: Participant,
  currentSessionId: string,
): boolean {
  return (
    participant.kind === PARTICIPANT_KINDS.agent &&
    participant.active_session === currentSessionId
  );
}

function agentIsRunnable(
  id: string,
  events: AnyEventRecord[],
  presence: Record<string, AgentPresence>,
  managedAgentsById: Map<string, ManagedAgent>,
): boolean {
  const pending = pendingAccessCountForParticipant(id, events) > 0;
  return agentLooksActive({
    managedAgent: managedAgentsById.get(id),
    presenceState: presence[id]?.state,
    hasPendingAccess: pending,
    hasOpenTurnActivity: agentHasOpenTurnActivity(events, id),
    hasClosedCurrentTurn: agentHasClosedCurrentTurn(events, id),
    hasPendingUserTurn: agentHasPendingUserTurn(events, id),
  });
}

function filterConnectingAgents(
  connectingAgents: ConnectingAgent[],
  currentSessionId: string | null,
  activeAgentIds: Set<string>,
): ConnectingAgent[] {
  if (currentSessionId === null) return [];
  return connectingAgents.filter(
    (agent) =>
      agent.sessionId === currentSessionId &&
      !activeAgentIds.has(agent.participantId),
  );
}

function connectingParticipantSnapshots(
  connectingAgents: ConnectingAgent[],
): Record<string, Participant> {
  const out: Record<string, Participant> = {};
  for (const agent of connectingAgents) {
    out[agent.participantId] = {
      kind: PARTICIPANT_KINDS.agent,
      name: agent.name,
      color: agent.color,
      runtime_id: agent.runtimeId,
      active_session: agent.sessionId,
    };
  }
  return out;
}

function earliestConnectingStart(
  connectingAgents: ConnectingAgent[],
): number | null {
  return connectingAgents.reduce<number | null>(
    (earliest, agent) =>
      earliest === null
        ? agent.startedAtMs
        : Math.min(earliest, agent.startedAtMs),
    null,
  );
}

function sortedIds(ids: string[]): string {
  return [...ids].sort().join(",");
}

/* When did the current agent turn begin? The boundary is the most recent
   moment the agent was not yet working: the last user message or the
   previous turn-end, whichever is later, falling back to the earliest event. */
function turnStartMsOf(events: AnyEventRecord[]): number | null {
  let boundary: number | null = null;
  let earliest: number | null = null;
  for (const event of events) {
    const ms = eventTimestampMs(event.timestamp);
    if (ms === null) continue;
    earliest = earliest === null ? ms : Math.min(earliest, ms);
    if (isTurnBoundary(event)) {
      boundary = boundary === null ? ms : Math.max(boundary, ms);
    }
  }
  return boundary ?? earliest;
}

function isTurnBoundary(event: AnyEventRecord): boolean {
  return (
    event.kind === EVENT_KINDS.turnEnd ||
    (event.participant_id.startsWith(participantPrefixes.user) &&
      event.kind !== EVENT_KINDS.accessResponse)
  );
}

/* A present-tense verb for what an active agent most recently did, derived
   from its latest event: genuine activity, not a canned rotation. */
function describeAgentActivity(
  events: AnyEventRecord[],
  activeIds: Set<string>,
): string {
  return activityLabel(latestAgentActivity(events, activeIds), events);
}

function latestAgentActivity(
  events: AnyEventRecord[],
  activeIds: Set<string>,
): AnyEventRecord | null {
  let latest: AnyEventRecord | null = null;
  let latestMs = -Infinity;
  for (const event of events) {
    if (!isAgentActivityCandidate(event, activeIds, events)) continue;
    const ms = eventTimestampMs(event.timestamp) ?? -Infinity;
    if (ms >= latestMs) {
      latestMs = ms;
      latest = event;
    }
  }
  return latest;
}

function isAgentActivityCandidate(
  event: AnyEventRecord,
  activeIds: Set<string>,
  events: AnyEventRecord[],
): boolean {
  if (!activeIds.has(event.participant_id)) return false;
  if (event.kind === EVENT_KINDS.turnEnd) return false;
  return event.kind !== EVENT_KINDS.accessRequest || accessRequestOpen(event, events);
}

const EVENT_ACTIVITY_LABELS: Partial<Record<AnyEventRecord["kind"], string>> = {
  [EVENT_KINDS.prose]: activityLabels.thinking,
  [EVENT_KINDS.file]: activityLabels.file,
  [EVENT_KINDS.todo]: activityLabels.plan,
  [EVENT_KINDS.flow]: activityLabels.flow,
  [EVENT_KINDS.html]: activityLabels.html,
  [EVENT_KINDS.choices]: activityLabels.question,
  [EVENT_KINDS.choice]: activityLabels.question,
  [EVENT_KINDS.subagentRun]: activityLabels.subAgent,
  [EVENT_KINDS.subagentOutput]: activityLabels.subAgent,
  [EVENT_KINDS.accessRequest]: activityLabels.access,
};

function activityLabel(
  event: AnyEventRecord | null,
  events: AnyEventRecord[],
): string {
  if (event === null) return activityLabels.thinking;
  if (event.kind === EVENT_KINDS.toolUse) {
    return toolVerb((event.payload as ToolUsePayload).tool_name);
  }
  return EVENT_ACTIVITY_LABELS[event.kind] ?? activityLabels.thinking;
}

const TOOL_VERB_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /bash|shell|exec|terminal|command/, label: activityLabels.command },
  { pattern: /read|cat|open/, label: activityLabels.read },
  { pattern: /edit|write|apply|patch|create/, label: activityLabels.edit },
  { pattern: /grep|glob|search|find|ripgrep/, label: activityLabels.search },
  { pattern: /fetch|web|http|browse|curl/, label: activityLabels.web },
  { pattern: /todo|task/, label: activityLabels.plan },
];

function toolVerb(tool: string): string {
  const normalized = tool.toLowerCase();
  return (
    TOOL_VERB_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.label ??
    activityLabels.tools
  );
}
