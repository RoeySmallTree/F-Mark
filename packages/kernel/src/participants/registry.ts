import { join } from "node:path";
import type { Paths } from "../paths.js";
import type { Participant } from "../project.js";
import { readActiveSession } from "../agents/activeSession.js";
import {
  defaultParticipants,
  isEnoent,
  readParticipants,
  writeParticipants,
} from "./store.js";
import type {
  ListParticipantsOptions,
  ParticipantWithSession,
} from "./types.js";

export const SYS_FORK_PARTICIPANT_ID = "sys-fork";
const SYS_FORK_NAME = "Fork";
const SYS_FORK_COLOR = "#71717a";

export async function ensureSystemForkParticipant(p: Paths): Promise<void> {
  let participants: Record<string, Participant>;
  try {
    participants = await readParticipants(p);
  } catch (err) {
    if (!isEnoent(err)) throw err;
    participants = defaultParticipants();
  }
  const existing = participants[SYS_FORK_PARTICIPANT_ID];
  if (
    existing !== undefined &&
    existing.kind === "sys" &&
    existing.name === SYS_FORK_NAME &&
    existing.color === SYS_FORK_COLOR
  ) {
    return;
  }
  const next: Record<string, Participant> = {
    ...participants,
    [SYS_FORK_PARTICIPANT_ID]: {
      kind: "sys",
      name: SYS_FORK_NAME,
      color: SYS_FORK_COLOR,
    },
  };
  await writeParticipants(p, next);
}

export async function listParticipants(
  p: Paths,
  opts: ListParticipantsOptions = {},
): Promise<Record<string, ParticipantWithSession>> {
  const participants = await readParticipants(p);
  const out: Record<string, ParticipantWithSession> = {};
  for (const [id, part] of Object.entries(participants)) {
    if (part.kind === "agent") {
      const active_session =
        opts.agentState !== undefined
          ? await opts.agentState.readActiveSession(id)
          : await readActiveSession(join(p.fmarkDir(), "agents"), id);
      out[id] = { ...part, active_session };
    } else {
      out[id] = { ...part, active_session: null };
    }
  }
  return out;
}
