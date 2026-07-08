import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import type { ArbitraryGroup } from "../../feed/projectFeed.js";
import type { ArbitraryGroupView } from "./presentation.js";

const NO_LOOSE_STRING_VALUES = {
  streaming: "streaming",
  working: "working",
  running: "running",
  done: "done",
  lg: "lg",
} as const;

interface ArbitraryGroupHeaderProps {
  group: ArbitraryGroup;
  view: ArbitraryGroupView;
  isOpen: boolean;
  onToggle(): void;
}

export function ArbitraryGroupHeader({
  group,
  view,
  isOpen,
  onToggle,
}: ArbitraryGroupHeaderProps): JSX.Element {
  return (
    <button
      type="button"
      className="tb-summary"
      aria-label="toggle group"
      aria-expanded={isOpen}
      onClick={onToggle}
    >
      <span className="chev" aria-hidden>
        ›
      </span>
      <span className="tb-avatar" aria-hidden>
        <ParticipantAvatar
          participantId={view.participantId}
          participant={view.participant}
          name={view.participantName}
          size={NO_LOOSE_STRING_VALUES.lg}
          title={view.participantName}
        />
      </span>
      <span className="tb-title" title={view.participantTitle}>
        <span className="tb-title-name">{view.participantName}</span>
        {view.isThinkingOnly ? (
          <span className="tb-title-mode">thinking to himself</span>
        ) : null}
      </span>
      {view.countLabels.length > 0 ? (
        <span className="tb-count">{view.countLabels.join(" · ")}</span>
      ) : null}
      {view.timingLabel.length > 0 || group.status === NO_LOOSE_STRING_VALUES.streaming ? (
        <span
          className={`tb-status ${group.status === NO_LOOSE_STRING_VALUES.streaming ? NO_LOOSE_STRING_VALUES.running : NO_LOOSE_STRING_VALUES.done}`}
          aria-label="group status"
        >
          {group.status === NO_LOOSE_STRING_VALUES.streaming ? (
            <span className="run-dot" aria-hidden />
          ) : null}
          {view.timingLabel.length > 0 ? view.timingLabel : NO_LOOSE_STRING_VALUES.working}
        </span>
      ) : null}
    </button>
  );
}
