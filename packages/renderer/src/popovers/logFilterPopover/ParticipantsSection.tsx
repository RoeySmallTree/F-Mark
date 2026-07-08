import type { LogFilter } from "../log-filter-types.js";
import { FilterChip } from "./FilterChip.js";
import {
  toggleString,
  type ParticipantEntry,
  type SetLogFilterDraft,
} from "./model.js";

interface ParticipantsSectionProps {
  draft: LogFilter;
  participants: ParticipantEntry[];
  setDraft: SetLogFilterDraft;
}

export function ParticipantsSection({
  draft,
  participants,
  setDraft,
}: ParticipantsSectionProps): JSX.Element {
  return (
    <div className="pop-section">
      <div className="pop-label">Participants</div>
      {participants.length === 0 ? (
        <NoParticipantsMessage />
      ) : (
        <ParticipantChips
          draft={draft}
          participants={participants}
          setDraft={setDraft}
        />
      )}
    </div>
  );
}

function NoParticipantsMessage(): JSX.Element {
  return (
    <p
      style={{
        fontFamily: "var(--serif)",
        fontStyle: "italic",
        fontSize: 12,
        color: "var(--ink-4)",
        margin: 0,
      }}
    >
      No participants yet.
    </p>
  );
}

function ParticipantChips({
  draft,
  participants,
  setDraft,
}: ParticipantsSectionProps): JSX.Element {
  return (
    <div className="pop-chips" role="group" aria-label="Filter by participant">
      {participants.map(([id, participant]) => (
        <FilterChip
          key={id}
          checked={draft.participants.includes(id)}
          label={participant.name}
          onToggle={() =>
            setDraft((d) => ({
              ...d,
              participants: toggleString(d.participants, id),
            }))
          }
        />
      ))}
    </div>
  );
}
