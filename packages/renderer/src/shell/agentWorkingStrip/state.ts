import type { Participant } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { GREEN_KINDS, renderArt } from "./art.js";
import { useArtColumns, useArtFrame, useArtKind, useNowMs } from "./hooks.js";
import { elapsedSeconds, prefersReducedMotion } from "./timing.js";
import type {
  AgentWorkingStripProps,
  AgentWorkingStripViewProps,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "Agent",
  blocked: "blocked",
  working: "working",
} as const;

function safePausedMs(approvalPausedMs: number): number {
  return Number.isFinite(approvalPausedMs) ? Math.max(0, approvalPausedMs) : 0;
}

function stripLabel(names: string[]): string {
  return names.length === 0
    ? NO_LOOSE_STRING_VALUES.agent
    : names.length === 1
      ? names[0]!
      : `${names.length} agents`;
}

function actionText(blocked: boolean, action: string): string {
  return blocked ? "waiting for your approval" : action.replace(/^(is|are) /, "");
}

function ariaLabel(blocked: boolean, label: string, action: string): string {
  return blocked ? `${label} is waiting for approval` : `${label} ${action}`;
}

export function useAgentWorkingStripState({
  agentIds,
  participantSnapshots = {},
  blocked,
  turnStartMs,
  approvalPausedMs = 0,
  approvalPauseStartMs = null,
  action,
}: AgentWorkingStripProps): AgentWorkingStripViewProps {
  const participants = useStore((s) => s.participants);
  const participantFor = (id: string): Participant | undefined =>
    participantSnapshots[id] ?? participants[id];
  const names = agentIds.map((id) => participantFor(id)?.name ?? id);
  const label = stripLabel(names);
  const firstId = agentIds[0];
  const firstParticipant =
    firstId !== undefined ? participantFor(firstId) : undefined;

  const kind = useArtKind();
  const reduceMotion = prefersReducedMotion();
  const { artRef, cols } = useArtColumns();
  const frame = useArtFrame({ blocked, kind, reduceMotion });
  const nowMs = useNowMs(approvalPauseStartMs);
  const frozenFrame = blocked || reduceMotion ? 0 : frame;

  return {
    actionText: actionText(blocked, action),
    ariaLabel: ariaLabel(blocked, label, action),
    art: renderArt(kind, frozenFrame, cols),
    artRef,
    blocked,
    elapsedSec: elapsedSeconds({
      nowMs,
      pausedMs: safePausedMs(approvalPausedMs),
      turnStartMs,
    }),
    firstId,
    firstParticipant,
    greenClass: GREEN_KINDS.has(kind) ? " art-green" : "",
    label,
    stateClass: blocked ? NO_LOOSE_STRING_VALUES.blocked : NO_LOOSE_STRING_VALUES.working,
  };
}

