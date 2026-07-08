import { useCallback, useState } from "react";
import type { AnyEventRecord } from "@f-mark/shared";
import { createClient } from "../../../../api/client.js";
import { createManagedAgentsClient } from "../../../../api/managedAgents.js";
import {
  rootScopeForSession,
  scopeToBody,
  type RootScope,
} from "../../../../api/rootScope.js";
import type { CommentGroup } from "../commentModel.js";
import { buildPostProseBody } from "./postBodyModel.js";
import {
  shouldEndTurnAfterComment,
  wakeTargetsForComment,
} from "./postRules.js";
import type { CommentPostBody } from "./types.js";
import type { RightCommentsSnapshot } from "./useRightCommentsSnapshot.js";

const NO_LOOSE_STRING_VALUES = {
  comment: "comment",
} as const;

export type PostComment = (
  key: string,
  group: CommentGroup,
  body: CommentPostBody,
) => Promise<void>;

interface CommentPoster {
  busyKey: string | null;
  postComment: PostComment;
}

type UpsertEvent = (event: AnyEventRecord) => void;

export function useCommentPoster({
  activePath,
  activePathId,
  currentSessionId,
  currentUserId,
  participants,
  sessions,
  token,
  upsertEvent,
}: RightCommentsSnapshot): CommentPoster {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const currentScope = useCallback(
    (): RootScope | null =>
      rootScopeForSession(
        sessions.find((s) => s.id === currentSessionId),
        activePathId,
        activePath,
      ),
    [activePath, activePathId, currentSessionId, sessions],
  );

  const postComment = useCallback<PostComment>(
    async (key, group, body): Promise<void> => {
      if (currentSessionId === null || currentUserId === null) return;
      const scope = currentScope();
      if (scope === null) return;
      setBusyKey(key);
      try {
        const client = createClient({ baseUrl: "", token });
        const managedClient = createManagedAgentsClient({ baseUrl: "", token });
        const response = await client.postProse(
          currentSessionId,
          buildPostProseBody(currentUserId, group, body),
          scope,
        );
        const targetIds = wakeTargetsForComment(
          group,
          body.mentions,
          participants,
        );
        if (targetIds.length > 0) {
          await managedClient.wakeSession(currentSessionId, {
            reason: NO_LOOSE_STRING_VALUES.comment,
            source_event: response.filename,
            target_participant_ids: targetIds,
            ...scopeToBody(scope),
          });
        }
        if (shouldEndTurnAfterComment(body)) {
          await client.postTurnEnd(currentSessionId, currentUserId, scope);
        }
        await refreshEvents(currentSessionId, scope, token, upsertEvent);
      } finally {
        setBusyKey(null);
      }
    },
    [
      currentScope,
      currentSessionId,
      currentUserId,
      participants,
      token,
      upsertEvent,
    ],
  );

  return {
    busyKey,
    postComment,
  };
}

async function refreshEvents(
  sessionId: string,
  scope: RootScope,
  token: string | null,
  upsertEvent: UpsertEvent,
): Promise<void> {
  const client = createClient({ baseUrl: "", token });
  const fresh = await client.listEvents(sessionId, scope);
  for (const event of fresh) upsertEvent(event);
}
