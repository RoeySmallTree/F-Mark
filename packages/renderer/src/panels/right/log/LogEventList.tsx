import type { JSX } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { LogEventRow } from "./LogEventRow.js";

interface LogEventListProps {
  events: AnyEventRecord[];
  participants: Record<string, Participant>;
  onJump(filename: string): void;
}

export function LogEventList({
  events,
  participants,
  onJump,
}: LogEventListProps): JSX.Element {
  return (
    <div role="list" className="log-list">
      {events.map((event, index) => (
        <LogEventRow
          key={event.filename}
          event={event}
          index={index}
          participant={participants[event.participant_id]}
          onJump={onJump}
        />
      ))}
    </div>
  );
}
