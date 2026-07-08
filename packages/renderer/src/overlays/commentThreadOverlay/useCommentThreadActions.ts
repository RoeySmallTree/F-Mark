import type {
  AnyEventRecord,
  Participant,
  PostProseBody,
} from "@f-mark/shared";
import { createClient, type Client } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { COMMENT_MARKER_CONTENT } from "../../comments/commentMarkers.js";
import {
  scopeToBody,
  type RootScope,
} from "../../api/rootScope.js";
import type {
  CommentLineRange,
  CommentThreadActions,
  ParticipantMap,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  comment: "comment",
  agent: "agent",
} as const;

interface UseCommentThreadActionsInput {
  currentSessionId: string | null;
  currentUserId: string | null;
  scope: RootScope | null;
  token: string | null;
  targetFile: string;
  lines: CommentLineRange | undefined;
  target: AnyEventRecord | undefined;
  participants: ParticipantMap;
  upsertEvent: (event: AnyEventRecord) => void;
}

interface CommentMutation {
  content: string;
  in_reply_to?: string;
  supersedes?: string;
}

interface ReadyMutationContext extends UseCommentThreadActionsInput {
  currentSessionId: string;
  currentUserId: string;
  scope: RootScope;
}

interface WakeTargetInput {
  managedClient: ReturnType<typeof createManagedAgentsClient>;
  sessionId: string;
  sourceFilename: string;
  scope: RootScope;
  target: AnyEventRecord | undefined;
  participants: ParticipantMap;
}

export function useCommentThreadActions(
  input: UseCommentThreadActionsInput,
): CommentThreadActions {
  return {
    async postReply(root, content) {
      await postCommentMutation(input, {
        content,
        in_reply_to: root.filename,
      });
    },
    async postResolve(root) {
      await postCommentMutation(input, {
        content: COMMENT_MARKER_CONTENT.resolved,
        supersedes: root.filename,
      });
    },
    async postUnresolve(root) {
      await postCommentMutation(input, {
        content: COMMENT_MARKER_CONTENT.unresolved,
        supersedes: root.filename,
      });
    },
  };
}

async function postCommentMutation(
  input: UseCommentThreadActionsInput,
  mutation: CommentMutation,
): Promise<void> {
  const context = getReadyMutationContext(input);
  if (context === null) return;

  const client = createClient({ baseUrl: "", token: context.token });
  const managedClient = createManagedAgentsClient({
    baseUrl: "",
    token: context.token,
  });
  const response = await client.postProse(
    context.currentSessionId,
    createCommentBody(context, mutation),
    context.scope,
  );

  await wakeTargetAgent({
    managedClient,
    sessionId: context.currentSessionId,
    sourceFilename: response.filename,
    scope: context.scope,
    target: context.target,
    participants: context.participants,
  });
  await refreshEvents(client, context.currentSessionId, context.scope, context.upsertEvent);
}

function getReadyMutationContext(
  input: UseCommentThreadActionsInput,
): ReadyMutationContext | null {
  if (
    input.currentSessionId === null ||
    input.currentUserId === null ||
    input.scope === null
  ) {
    return null;
  }
  return {
    ...input,
    currentSessionId: input.currentSessionId,
    currentUserId: input.currentUserId,
    scope: input.scope,
  };
}

function createCommentBody(
  context: ReadyMutationContext,
  mutation: CommentMutation,
): PostProseBody {
  return {
    participant_id: context.currentUserId,
    append_to: context.targetFile,
    mode: NO_LOOSE_STRING_VALUES.comment,
    ...(context.lines === undefined ? {} : { lines: context.lines }),
    ...mutation,
  };
}

async function wakeTargetAgent(input: WakeTargetInput): Promise<void> {
  const targetParticipantId = getWakeTargetParticipantId(
    input.target,
    input.participants,
  );
  if (targetParticipantId === null) return;
  await input.managedClient.wakeSession(input.sessionId, {
    reason: NO_LOOSE_STRING_VALUES.comment,
    source_event: input.sourceFilename,
    target_participant_ids: [targetParticipantId],
    ...scopeToBody(input.scope),
  });
}

function getWakeTargetParticipantId(
  target: AnyEventRecord | undefined,
  participants: ParticipantMap,
): string | null {
  const participantId = target?.participant_id;
  if (participantId === undefined) return null;
  const participant: Participant | undefined = participants[participantId];
  return participant?.kind === NO_LOOSE_STRING_VALUES.agent ? participantId : null;
}

async function refreshEvents(
  client: Client,
  sessionId: string,
  scope: RootScope,
  upsertEvent: (event: AnyEventRecord) => void,
): Promise<void> {
  const fresh = await client.listEvents(sessionId, scope);
  for (const event of fresh) upsertEvent(event);
}
