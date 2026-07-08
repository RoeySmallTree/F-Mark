import type { JSX } from "react";
import { Bot } from "lucide-react";
import type { Participant, ProseMention } from "@f-mark/shared";
import { ParticipantAvatar } from "../ParticipantAvatar.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  sm: "sm",
} as const;

interface MentionTagButtonProps {
  busy: boolean;
  participants: Record<string, Participant>;
  selectedMentions: ProseMention[];
  onOpenMentions(): void;
}

export function MentionTagButton({
  busy,
  participants,
  selectedMentions,
  onOpenMentions,
}: MentionTagButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={[
        "line-comment-mention",
        selectedMentions.length > 0 ? "active" : "",
      ]
        .join(" ")
        .trim()}
      onClick={onOpenMentions}
      disabled={busy}
      aria-label={mentionButtonLabel(selectedMentions)}
      title="Tag agents"
    >
      {selectedMentions.length === 0 ? (
        <>
          <Bot size={13} aria-hidden />
          Tag
        </>
      ) : (
        <span className="line-comment-mention-avatars">
          {selectedMentions.map((mention) => (
            <MentionAvatar
              key={mention.participant_id}
              mention={mention}
              participant={participants[mention.participant_id]}
            />
          ))}
        </span>
      )}
    </button>
  );
}

function MentionAvatar({
  mention,
  participant,
}: {
  mention: ProseMention;
  participant: Participant | undefined;
}): JSX.Element {
  return (
    <ParticipantAvatar
      participantId={mention.participant_id}
      participant={participant}
      name={mention.display_name}
      kind={NO_LOOSE_STRING_VALUES.agent}
      color={participant?.color}
      runtimeId={participant?.runtime_id ?? null}
      size={NO_LOOSE_STRING_VALUES.sm}
    />
  );
}

function mentionButtonLabel(selectedMentions: ProseMention[]): string {
  return selectedMentions.length === 0
    ? "Tag agents"
    : `Tagged: ${selectedMentions.map((m) => m.display_name).join(", ")}`;
}
