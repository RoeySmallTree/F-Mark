import type { Participant, WakeSessionResponse } from "@f-mark/shared";

/* The kernel reports exactly who a message reached and who it did not. Nothing
   used to read either list, so an agent parked on another session vanished from
   the conversation with no trace: you sent a message to a session with two
   agents, one replied, and nothing said why the other stayed quiet.

   Not every skip is worth saying out loud. A skip is worth reporting when the
   reader had reason to expect that agent to answer and it did not. */

const SILENT_REASONS = new Set<string>([
  /* The agent is attached and awake; it simply had nothing new to read. That
     is the system working, and announcing it on every send would train people
     to ignore this line — which is the one thing it cannot afford. */
  "no-unread-events",
]);

const REASON_TEXT: Record<string, string> = {
  "not-active": "working in another session",
  paused: "paused",
  "pane-dead": "its terminal is gone",
  "runtime-missing": "no runtime configured",
  "runtime-unknown": "its runtime is not recognised",
  "resume-unsupported": "its runtime cannot be resumed",
  "resume-failed": "it could not be resumed",
  "missing-native-session-id": "it has no provider session to resume",
  "not-idle-stopped": "it is mid-run",
  "not-managed": "it is not a managed agent",
  "invalid-target": "the target was not valid",
};

export interface WakeNotice {
  reached: string[];
  missed: Array<{ name: string; because: string }>;
}

function nameOf(
  participantId: string,
  participants: Record<string, Participant>,
): string {
  return participants[participantId]?.name ?? participantId;
}

/**
 * Turn a wake response into something worth showing, or `null` when there is
 * nothing the reader needs to act on.
 *
 * Returns `null` when every agent was reached, and also when the only agents
 * missed were missed for a reason that is not a problem — silence is correct
 * far more often than it is a bug, and a notice that cries wolf is worse than
 * no notice at all.
 */
export function buildWakeNotice(
  response: WakeSessionResponse,
  participants: Record<string, Participant>,
): WakeNotice | null {
  /* Read both lists defensively. This runs on every send, so a response that
     is missing a field — an older kernel, a partial mock — must degrade to
     "nothing to report" rather than throw inside the compose bar. */
  const skipped = Array.isArray(response.skipped) ? response.skipped : [];
  const notified = Array.isArray(response.notified) ? response.notified : [];

  const missed = skipped
    .filter((agent) => !SILENT_REASONS.has(agent.reason))
    .map((agent) => ({
      name: nameOf(agent.participant_id, participants),
      because: REASON_TEXT[agent.reason] ?? agent.reason,
    }));
  if (missed.length === 0) return null;
  return {
    reached: notified.map((id) => nameOf(id, participants)),
    missed,
  };
}

/** One line, for the compose bar. */
export function wakeNoticeText(notice: WakeNotice): string {
  const missed = notice.missed
    .map((agent) => `${agent.name} (${agent.because})`)
    .join(", ");
  if (notice.reached.length === 0) return `No agent was notified — ${missed}`;
  return `Sent to ${notice.reached.join(", ")}. Not notified: ${missed}`;
}
