const NO_LOOSE_STRING_VALUES = {
  standalone: "standalone",
} as const;

/* ChoicesCard — renders a question with selectable options. The "chosen"
   state comes from the latest matching `choice` event for the current user.
   Clicking an option POSTs a new `choice` event via the API client. */

import { type JSX } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { ChoicesHeader } from "./choicesCard/ChoicesHeader.js";
import { ChoicesOptions } from "./choicesCard/ChoicesOptions.js";
import { useChoicesCardModel } from "./choicesCard/useChoicesCardModel.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
  /** "embedded" drops the head + menu chrome. */
  variant?: "standalone" | "embedded";
}

export function ChoicesCard({
  event,
  participants,
  allEvents,
  variant = NO_LOOSE_STRING_VALUES.standalone,
}: Props): JSX.Element {
  const model = useChoicesCardModel({
    event,
    participants,
    allEvents,
    variant,
  });

  return (
    <div
      className={
        model.isEmbedded
          ? "choices-card choices-card-embedded"
          : "choices-card"
      }
      data-event-kind="choices"
    >
      {!model.isEmbedded && <ChoicesHeader model={model} />}
      <div className="choices-body">
        <h3 className="choices-q">{model.payload.question}</h3>
        <ChoicesOptions model={model} />
        {model.latest !== undefined && (
          <div className="choices-foot">
            Answered {model.formatTimestamp(model.latest.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}
