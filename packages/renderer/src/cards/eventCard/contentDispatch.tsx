import { type JSX } from "react";
import { ChoiceCard } from "../ChoiceCard.js";
import { ChoicesCard } from "../ChoicesCard.js";
import { EmbedCard } from "../EmbedCard.js";
import { FileCard } from "../FileCard.js";
import { TodoCard } from "../TodoCard.js";
import type { EventCardProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  choices: "choices",
  choice: "choice",
  html: "html",
  todo: "todo",
  file: "file",
} as const;

export function renderContentEvent(
  props: EventCardProps,
): JSX.Element | null | undefined {
  if (props.event.kind === NO_LOOSE_STRING_VALUES.choices) {
    return (
      <ChoicesCard
        event={props.event}
        participants={props.participants}
        allEvents={props.allEvents}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.choice) {
    return (
      <ChoiceCard
        event={props.event}
        participants={props.participants}
        allEvents={props.allEvents}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.html) {
    return (
      <EmbedCard
        event={props.event}
        participants={props.participants}
        allEvents={props.allEvents}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.todo) {
    return (
      <TodoCard
        event={props.event}
        participants={props.participants}
        allEvents={props.allEvents}
      />
    );
  }
  if (props.event.kind === NO_LOOSE_STRING_VALUES.file) {
    return (
      <FileCard
        event={props.event}
        participants={props.participants}
        comments={props.comments}
      />
    );
  }
  return undefined;
}
