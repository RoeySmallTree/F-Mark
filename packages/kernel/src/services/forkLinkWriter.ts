import type { ForkLinkPayload } from "@f-mark/shared";
import { writeEventFile } from "../events/writer.js";
import { SYS_FORK_PARTICIPANT_ID } from "../participants.js";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { publishEventWrite } from "./eventPublisher.js";

export interface ForkLinkWriteInput {
  /** Same Paths for source and fork in v1 (always same project root). */
  p: Paths;
  sourceSessionId: string;
  forkSessionId: string;
  sourceSlug: string;
  forkSlug: string;
  /** Shared fork-instant starting timestamp. Each side's writer may bump
   *  independently on EEXIST; that asymmetry is acceptable because each
   *  card displays its own filename's timestamp. */
  timestamp: string;
  bus: Bus | null;
}

export type ForkLinkWriteSideResult =
  | { filename: string }
  | { error: string };

export interface ForkLinkWriteResult {
  source: ForkLinkWriteSideResult;
  fork: ForkLinkWriteSideResult;
}

async function writeOneSide(
  input: ForkLinkWriteInput,
  sessionId: string,
  payload: ForkLinkPayload,
): Promise<ForkLinkWriteSideResult> {
  try {
    const filename = await writeEventFile(input.p, sessionId, {
      participant_id: SYS_FORK_PARTICIPANT_ID,
      kind: "fork-link",
      ext: "json",
      contents: JSON.stringify(payload),
      timestamp: input.timestamp,
    });
    if (input.bus !== null) {
      publishEventWrite(input.bus, sessionId, {
        filename,
        kind: "fork-link",
        participantId: SYS_FORK_PARTICIPANT_ID,
      });
    }
    return { filename };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function writeForkLinkPair(
  input: ForkLinkWriteInput,
): Promise<ForkLinkWriteResult> {
  const sourcePayload: ForkLinkPayload = {
    schema: "fmark.fork-link.v1",
    direction: "to",
    other_session_id: input.forkSessionId,
    other_session_slug: input.forkSlug,
  };
  const forkPayload: ForkLinkPayload = {
    schema: "fmark.fork-link.v1",
    direction: "from",
    other_session_id: input.sourceSessionId,
    other_session_slug: input.sourceSlug,
  };
  const source = await writeOneSide(
    input,
    input.sourceSessionId,
    sourcePayload,
  );
  const fork = await writeOneSide(input, input.forkSessionId, forkPayload);
  return { source, fork };
}
