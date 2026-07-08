import type { RefObject } from "react";
import type { Participant } from "@f-mark/shared";

export interface AgentWorkingStripProps {
  /** Active agent participant ids (genuine; drives avatar + name). */
  agentIds: string[];
  /** Temporary participant records for agents that are not persisted yet. */
  participantSnapshots?: Record<string, Participant>;
  /** True when an active agent is waiting on a pending access request. */
  blocked: boolean;
  /** Epoch ms the current agent turn began, or null if unknown. */
  turnStartMs: number | null;
  /** Milliseconds spent in already-answered approval pauses this turn. */
  approvalPausedMs?: number;
  /** Epoch ms where the current approval pause began, or null if unpaused. */
  approvalPauseStartMs?: number | null;
  /** Present-tense verb for what the agent most recently did. */
  action: string;
}

export interface AgentWorkingStripViewProps {
  actionText: string;
  ariaLabel: string;
  art: string;
  artRef: RefObject<HTMLSpanElement | null>;
  blocked: boolean;
  elapsedSec: number | null;
  firstId?: string;
  firstParticipant?: Participant;
  greenClass: string;
  label: string;
  stateClass: string;
}
