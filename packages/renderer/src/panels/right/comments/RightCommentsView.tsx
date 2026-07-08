import type { JSX } from "react";
import { AgentMentionPicker } from "../../../components/AgentMentionPicker.js";
import { ThreadCard } from "./ThreadCard.js";
import type { RightCommentsController } from "./useRightCommentsController.js";

interface RightCommentsViewProps {
  controller: RightCommentsController;
}

export function RightCommentsView({
  controller,
}: RightCommentsViewProps): JSX.Element {
  const {
    actions,
    activeKey,
    busyKey,
    currentSessionId,
    currentWho,
    editing,
    groups,
    mentionTarget,
    panelRef,
    participants,
    replyDrafts,
    replyMentions,
    token,
  } = controller;

  return (
    <div className="right-comments-wrap">
      <div ref={panelRef} className="right-comments list">
        {groups.map((group) => (
          <ThreadCard
            key={group.key}
            group={group}
            participants={participants}
            currentWho={currentWho}
            active={group.key === activeKey}
            style={undefined}
            replyDrafts={replyDrafts}
            replyMentions={replyMentions}
            editing={editing}
            busyKey={busyKey}
            actions={actions}
          />
        ))}
        {mentionTarget !== null ? (
          <AgentMentionPicker
            anchorRect={mentionTarget.rect}
            sessionId={currentSessionId}
            token={token}
            participants={participants}
            selectedIds={
              new Set(
                (replyMentions[mentionTarget.rootFilename] ?? []).map(
                  (mention) => mention.participant_id,
                ),
              )
            }
            onSelect={(mention) =>
              controller.addReplyMention(mentionTarget.rootFilename, mention)
            }
            onClose={controller.closeReplyMentions}
          />
        ) : null}
      </div>
    </div>
  );
}
