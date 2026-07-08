import type { CSSProperties, JSX } from "react";
import { ChevronRight, Text } from "lucide-react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { ParticipantAvatar } from "../../../components/ParticipantAvatar.js";
import {
  KIND_ICON,
  KIND_LABEL,
  formatLogTimestamp,
} from "./logPresentation.js";
import { shortSummary } from "./logSummary.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface LogEventRowProps {
  event: AnyEventRecord;
  index: number;
  participant: Participant | undefined;
  onJump(filename: string): void;
}

export function LogEventRow({
  event,
  index,
  participant,
  onJump,
}: LogEventRowProps): JSX.Element {
  const participantKind = participant?.kind === NO_LOOSE_STRING_VALUES.user ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent;
  const KindIcon = KIND_ICON[event.kind] ?? Text;
  const timestamp = formatLogTimestamp(event.timestamp);
  const participantName = participant?.name ?? event.participant_id;

  return (
    <button
      type="button"
      role="listitem"
      className="log-row staggered-row"
      style={{ "--i": Math.min(index, 5) } as CSSProperties}
      data-event-filename={event.filename}
      data-event-kind={event.kind}
      onClick={() => onJump(event.filename)}
      title={`${participantName} · ${event.kind} · ${timestamp}`}
    >
      <span
        className={["log-who", participantKind].join(" ")}
        aria-label={participantName}
      >
        <ParticipantAvatar
          participantId={event.participant_id}
          participant={participant}
          kind={participantKind}
          name={participantName}
          color={participant?.color}
          runtimeId={participant?.runtime_id ?? null}
          size={NO_LOOSE_STRING_VALUES.sm}
        />
      </span>
      <span className="ts">{timestamp}</span>
      <span
        className="kind-tag"
        data-kind={event.kind}
        aria-label={`Kind: ${KIND_LABEL[event.kind] ?? event.kind}`}
      >
        <KindIcon size={11} aria-hidden="true" />
        <span className="kind-tag-label">
          {KIND_LABEL[event.kind] ?? event.kind}
        </span>
      </span>
      <span className="summary">{shortSummary(event)}</span>
      <ChevronRight size={11} className="row-jump" aria-hidden="true" />
    </button>
  );
}
