const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  card: "card",
  choice: "choice",
  choices: "choices",
  msgCard: "msg-card",
  user: "user",
} as const;

const choiceCopy = {
  answered: "Answered",
  chose: "Chose",
  noSelection: "No option selected",
  separator: ", ",
} as const;

import type {
  AnyEventRecord,
  ChoicePayload,
  ChoicesPayload,
  Participant,
} from "@f-mark/shared";
import type { JSX } from "react";
import { EventCardHeader } from "./EventCardHeader.js";
import { whoOf } from "./format.js";

interface ChoiceCardProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
}

export function ChoiceCard({
  event,
  participants,
  allEvents,
}: ChoiceCardProps): JSX.Element {
  const payload = event.payload as ChoicePayload;
  const who = whoOf(event.participant_id, participants);
  const classes = [
    NO_LOOSE_STRING_VALUES.card,
    NO_LOOSE_STRING_VALUES.msgCard,
    who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent,
  ].join(" ");
  const choice = choiceSummary(payload, allEvents);

  return (
    <article className={classes} data-event-kind={NO_LOOSE_STRING_VALUES.choice}>
      <div className="stripe" aria-hidden />
      <div className="body">
        <EventCardHeader
          className="card-head"
          who={who}
          timestamp={event.timestamp}
        />
        <div className="text choice-response-text">
          <span className="choice-response-kicker">{choiceCopy.answered}</span>
          <span className="choice-response-answer">
            {choiceCopy.chose} {choice.answer}
          </span>
          {choice.question !== undefined ? (
            <span className="choice-response-question">{choice.question}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function choiceSummary(
  payload: ChoicePayload,
  allEvents: readonly AnyEventRecord[],
): { answer: string; question?: string } {
  const choices = findChoices(allEvents, payload.choices_id);
  const labels = optionLabels(payload, choices);
  return {
    answer: labels.length > 0 ? labels.join(choiceCopy.separator) : choiceCopy.noSelection,
    question: choices?.question,
  };
}

function findChoices(
  events: readonly AnyEventRecord[],
  choicesId: string,
): ChoicesPayload | undefined {
  const match = events.find((candidate) => {
    if (candidate.kind !== NO_LOOSE_STRING_VALUES.choices) return false;
    return (candidate.payload as ChoicesPayload).id === choicesId;
  });
  return match?.payload as ChoicesPayload | undefined;
}

function optionLabels(
  payload: ChoicePayload,
  choices: ChoicesPayload | undefined,
): string[] {
  const labels = new Map(
    choices?.options.map((option) => [option.id, option.label] as const) ?? [],
  );
  return payload.selected.map((id) => labels.get(id) ?? id);
}
