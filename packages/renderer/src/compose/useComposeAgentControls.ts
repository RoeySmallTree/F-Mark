import { useCallback, useMemo } from "react";
import type { AccessRequestPayload } from "@f-mark/shared";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { scopeToBody, type RootScope } from "../api/rootScope.js";
import { accessRequestOpen, pendingAccessCountForParticipant } from "../cards/AccessRequestCard.js";
import type { PendingApprovalAction } from "./SendButton.js";
import { useStore } from "../state/store.js";
import {
  agentHasClosedCurrentTurn,
  agentHasOpenTurnActivity,
  agentHasPendingUserTurn,
  agentLooksActive,
  presenceLooksRunnable,
} from "../lib/agentActivity.js";
import {
  accessRequestSuggestions,
  cssEscape,
} from "./composeHelpers.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  accessRequest: "access-request",
  turnEnd: "turn-end",
  interrupt: "interrupt",
  removed: "removed",
  accessRequestCardHighlight: "access-request-card-highlight",
} as const;

interface UseComposeAgentControlsOptions {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  currentScope: RootScope | null;
}

export interface ComposeAgentControlsState {
  isAgentTurn: boolean;
  activeAgentCount: number;
  pendingApprovalAction: PendingApprovalAction | null;
  interruptSessionAgents(): void;
}

export function useComposeAgentControls({
  token,
  sessionId,
  userId,
  currentScope,
}: UseComposeAgentControlsOptions): ComposeAgentControlsState {
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const presence = useStore((s) => s.presence);
  const managedAgents = useStore((s) => s.managedAgents);

  const sessionAgentIds = useMemo(
    () =>
      Object.entries(participants)
        .filter(([, p]) => p.kind === NO_LOOSE_STRING_VALUES.agent && p.active_session === sessionId)
        .map(([id]) => id),
    [participants, sessionId],
  );
  const managedAgentsById = useMemo(
    () => new Map(managedAgents.map((agent) => [agent.participant_id, agent])),
    [managedAgents],
  );
  const sessionAgentPresent = useMemo(
    () =>
      sessionAgentIds.some((id) => presenceLooksRunnable(presence[id]?.state)),
    [sessionAgentIds, presence],
  );
  const pendingAccessRequests = useMemo(
    () =>
      events.filter((event) => {
        if (event.kind !== NO_LOOSE_STRING_VALUES.accessRequest) return false;
        if (!sessionAgentIds.includes(event.participant_id)) return false;
        return accessRequestOpen(event, events);
      }),
    [events, sessionAgentIds],
  );
  const activeAgentIds = useMemo(
    () =>
      sessionAgentIds.filter((id) =>
        agentLooksActive({
          managedAgent: managedAgentsById.get(id),
          presenceState: presence[id]?.state,
          hasPendingAccess: pendingAccessCountForParticipant(id, events) > 0,
          hasOpenTurnActivity: agentHasOpenTurnActivity(events, id),
          hasClosedCurrentTurn: agentHasClosedCurrentTurn(events, id),
          hasPendingUserTurn: agentHasPendingUserTurn(events, id),
        }),
      ),
    [events, managedAgentsById, presence, sessionAgentIds],
  );
  const hasTurnEnd = useMemo(
    () => events.some((event) => event.kind === NO_LOOSE_STRING_VALUES.turnEnd),
    [events],
  );
  const isAgentTurn =
    activeAgentIds.length > 0 || (!hasTurnEnd && sessionAgentPresent);

  const interruptSessionAgents = useCallback((): void => {
    if (sessionId === null || sessionAgentIds.length === 0) return;
    const managed = createManagedAgentsClient({ baseUrl: "", token });
    for (const id of sessionAgentIds) {
      const agent = managedAgentsById.get(id);
      if (
        agent?.controllable === false ||
        agent?.membership_state === NO_LOOSE_STRING_VALUES.removed
      ) {
        continue;
      }
      void managed.command(id, { type: NO_LOOSE_STRING_VALUES.interrupt }, currentScope).catch(() => {
        /* best-effort: a pane may already be gone */
      });
    }
  }, [currentScope, managedAgentsById, sessionAgentIds, sessionId, token]);

  const respondToFirstPendingApproval = useCallback(
    (decision: "approve" | "deny", optionId?: string): void => {
      const first = pendingAccessRequests[0];
      if (first === undefined || sessionId === null || userId === null) return;
      const request = first.payload as AccessRequestPayload;
      const managed = createManagedAgentsClient({ baseUrl: "", token });
      void managed.respondAccessRequest(first.participant_id, request.request_id, {
        session_id: sessionId,
        participant_id: userId,
        decision,
        ...(optionId !== undefined ? { option_id: optionId } : {}),
        ...(currentScope !== null ? scopeToBody(currentScope) : {}),
      });
    },
    [currentScope, pendingAccessRequests, sessionId, token, userId],
  );

  const showFirstPendingApproval = useCallback((): void => {
    const first = pendingAccessRequests[0];
    if (first === undefined) return;
    const request = first.payload as AccessRequestPayload;
    const target = document.querySelector<HTMLElement>(
      `[data-access-request-id="${cssEscape(request.request_id)}"]`,
    );
    if (target === null) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add(NO_LOOSE_STRING_VALUES.accessRequestCardHighlight);
    window.setTimeout(() => {
      target.classList.remove(NO_LOOSE_STRING_VALUES.accessRequestCardHighlight);
    }, 1200);
  }, [pendingAccessRequests]);

  const pendingApprovalAction = useMemo(() => {
    const first = pendingAccessRequests[0];
    if (first === undefined) return null;
    const request = first.payload as AccessRequestPayload;
    return {
      requestId: request.request_id,
      participantId: first.participant_id,
      count: pendingAccessRequests.length,
      suggestions: accessRequestSuggestions(request),
      onShow: showFirstPendingApproval,
      onRespond: respondToFirstPendingApproval,
    };
  }, [
    pendingAccessRequests,
    respondToFirstPendingApproval,
    showFirstPendingApproval,
  ]);

  return {
    isAgentTurn,
    activeAgentCount: activeAgentIds.length,
    pendingApprovalAction,
    interruptSessionAgents,
  };
}
