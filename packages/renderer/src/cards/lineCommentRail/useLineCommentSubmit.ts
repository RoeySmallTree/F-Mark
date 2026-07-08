import { useCallback, useState } from "react";
import type {
  AnyEventRecord,
  Participant,
  ProseMention,
} from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import {
  rootScopeForSession,
  scopeToBody,
} from "../../api/rootScope.js";
import type { SessionMeta } from "../../api/client.js";
import { readCommentEndsTurn } from "../../state/settings.js";
import type { CommentTarget } from "../../state/store.js";
import { useCommentUiRouting } from "../../hooks/useCommentUiRouting.js";
import { RIGHT_TAB_IDS } from "../../state/rightTabsConfig.js";
import { targetFrom } from "./commentTargets.js";
import type { LineRange } from "./lineGeometry.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  comments: RIGHT_TAB_IDS.comments,
  comment: "comment",
} as const;

interface UseLineCommentSubmitOptions {
  activePath: string | null;
  activePathId: string | null;
  currentSessionId: string | null;
  currentUserId: string | null;
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  selectedMentions: ProseMention[];
  sessions: SessionMeta[];
  token: string | null;
  clearSavedDraft: (lines: LineRange) => void;
  resetDraftState: () => void;
  setCommentTarget: (target: CommentTarget | null) => void;
  setRightTab: (value: "comments") => void;
  upsertEvent: (event: AnyEventRecord) => void;
}

function wakeTargetsForComment(
  mentions: ProseMention[],
  participants: Record<string, Participant>,
  authorId: string,
): string[] {
  const wakeTargets = new Set(mentions.map((mention) => mention.participant_id));
  if (participants[authorId]?.kind === NO_LOOSE_STRING_VALUES.agent) wakeTargets.add(authorId);
  return [...wakeTargets];
}

export function useLineCommentSubmit({
  activePath,
  activePathId,
  currentSessionId,
  currentUserId,
  event,
  participants,
  selectedMentions,
  sessions,
  token,
  clearSavedDraft,
  resetDraftState,
  setCommentTarget,
  setRightTab,
  upsertEvent,
}: UseLineCommentSubmitOptions) {
  const [busy, setBusy] = useState(false);
  const { commentsPanelAvailable } = useCommentUiRouting();

  const focusComments = useCallback(
    (lines: LineRange): void => {
      setCommentTarget(targetFrom(event.filename, lines));
      if (commentsPanelAvailable) {
        setRightTab(NO_LOOSE_STRING_VALUES.comments);
      }
    },
    [
      commentsPanelAvailable,
      event.filename,
      setCommentTarget,
      setRightTab,
    ],
  );

  const submitComment = useCallback(
    async (lines: LineRange | null, draft: string): Promise<void> => {
      const trimmed = draft.trim();
      if (
        lines === null ||
        trimmed.length === 0 ||
        currentSessionId === null ||
        currentUserId === null
      ) {
        return;
      }

      const scope = rootScopeForSession(
        sessions.find((s) => s.id === currentSessionId),
        activePathId,
        activePath,
      );
      if (scope === null) return;
      setBusy(true);
      try {
        const client = createClient({ baseUrl: "", token });
        const managedClient = createManagedAgentsClient({ baseUrl: "", token });
        const target = targetFrom(event.filename, lines);
        const response = await client.postProse(
          currentSessionId,
          {
            participant_id: currentUserId,
            content: trimmed,
            append_to: event.filename,
            mode: NO_LOOSE_STRING_VALUES.comment,
            lines,
            ...(selectedMentions.length > 0 ? { mentions: selectedMentions } : {}),
          },
          scope,
        );
        const wakeTargets = wakeTargetsForComment(
          selectedMentions,
          participants,
          event.participant_id,
        );
        if (wakeTargets.length > 0) {
          await managedClient.wakeSession(currentSessionId, {
            reason: NO_LOOSE_STRING_VALUES.comment,
            source_event: response.filename,
            target_participant_ids: wakeTargets,
            ...scopeToBody(scope),
          });
        }
        if (readCommentEndsTurn()) {
          await client.postTurnEnd(currentSessionId, currentUserId, scope);
        }
        const fresh = await client.listEvents(currentSessionId, scope);
        for (const e of fresh) upsertEvent(e);
        clearSavedDraft(lines);
        setCommentTarget(target);
        if (commentsPanelAvailable) {
          setRightTab(NO_LOOSE_STRING_VALUES.comments);
        }
        resetDraftState();
      } finally {
        setBusy(false);
      }
    },
    [
      activePath,
      activePathId,
      clearSavedDraft,
      commentsPanelAvailable,
      currentSessionId,
      currentUserId,
      event.filename,
      event.participant_id,
      participants,
      resetDraftState,
      selectedMentions,
      sessions,
      setCommentTarget,
      setRightTab,
      token,
      upsertEvent,
    ],
  );

  return { busy, focusComments, submitComment };
}
