import type {
  AccessRequestPayload,
  AutoStreamKind,
  AutoStreamOptions,
  HookPayload,
} from "./autoStream/types.js";
import type { ProjectedEvent } from "./projectTurn.js";
import { AccessRequestExtractor } from "./autoStream/accessRequests.js";
import { AutoStreamRunner } from "./autoStream/AutoStreamRunner.js";
import { LiveAssistantTextExtractor } from "./autoStream/liveAssistant.js";
import { PostToolUseProjector } from "./autoStream/subagents.js";

export type { AutoStreamKind } from "./autoStream/types.js";

const liveAssistantTextExtractor = new LiveAssistantTextExtractor();
const accessRequestExtractor = new AccessRequestExtractor();
const postToolUseProjector = new PostToolUseProjector();

export function extractLiveAssistantTextEvent(input: {
  payload: HookPayload;
  participantId: string;
  runtimeId: string | null;
}): Extract<ProjectedEvent, { kind: "prose" }> | null {
  return liveAssistantTextExtractor.extract(input);
}

export function extractAccessRequest(input: {
  payload: HookPayload;
  participantId: string;
  runtimeId: string | null;
}): AccessRequestPayload | null {
  return accessRequestExtractor.extract(input);
}

export function extractPostToolUseEvent(input: {
  payload: HookPayload;
  participantId: string;
  runtimeId: string | null;
}): ProjectedEvent | null {
  return postToolUseProjector.extract(input);
}

export async function runAutoStream(
  explicitParticipantId: string | null,
  kind: AutoStreamKind,
  stdinRaw: string,
  options: AutoStreamOptions = {},
): Promise<number> {
  return new AutoStreamRunner().run(
    explicitParticipantId,
    kind,
    stdinRaw,
    options,
  );
}
