import { useMemo } from "react";
import type {
  AnyEventRecord,
  ChoicePayload,
  ChoicesPayload,
} from "@f-mark/shared";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { ProseCard } from "./cards/ProseCard.js";
import { ChoicesCard } from "./cards/ChoicesCard.js";
import { TurnEndMarker } from "./cards/TurnEndMarker.js";

function choicesAnswers(
  all: AnyEventRecord[],
  choices: AnyEventRecord,
): AnyEventRecord[] {
  const id = (choices.payload as ChoicesPayload).id;
  return all.filter(
    (e) => e.kind === "choice" && (e.payload as ChoicePayload).choices_id === id,
  );
}

export function Feed(): JSX.Element {
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const agg = useMemo(() => aggregate(events), [events]);

  return (
    <main className="min-w-0 flex-1 overflow-auto p-4">
      {agg.feed.length === 0 ? (
        <p className="text-sm text-neutral-400">No events yet.</p>
      ) : (
        <ul className="space-y-3">
          {agg.feed.map((event) => {
            const participant = participants[event.participant_id];
            if (event.kind === "prose") {
              return (
                <li key={event.filename}>
                  <ProseCard
                    event={event}
                    participant={participant}
                    comments={agg.commentsByTarget.get(event.filename) ?? []}
                  />
                </li>
              );
            }
            if (event.kind === "choices") {
              return (
                <li key={event.filename}>
                  <ChoicesCard
                    event={event}
                    answers={choicesAnswers(agg.events, event)}
                  />
                </li>
              );
            }
            if (event.kind === "turn-end") {
              return (
                <li key={event.filename}>
                  <TurnEndMarker event={event} />
                </li>
              );
            }
            return (
              <li
                key={event.filename}
                className="rounded border border-neutral-200 p-3 text-xs text-neutral-500"
              >
                {event.kind} · {event.participant_id}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
