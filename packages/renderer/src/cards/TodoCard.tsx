import type { JSX } from "react";
import { TodoCardHeader } from "./todoCard/TodoCardHeader.js";
import { TodoCardItem } from "./todoCard/TodoCardItem.js";
import { TodoDraftItem } from "./todoCard/TodoDraftItem.js";
import type { TodoCardProps } from "./todoCard/types.js";
import { useTodoCardModel } from "./todoCard/useTodoCardModel.js";

const NO_LOOSE_STRING_VALUES = {
  standalone: "standalone",
} as const;

export function TodoCard({
  event,
  participants,
  allEvents,
  variant = NO_LOOSE_STRING_VALUES.standalone,
}: TodoCardProps): JSX.Element | null {
  const model = useTodoCardModel({ event, participants, allEvents, variant });

  if (model === null) return null;

  return (
    <div
      className={model.container.className}
      data-event-kind="todo"
      data-inline-todo-id={model.container.inlineTodoId}
    >
      {model.header !== null ? <TodoCardHeader model={model.header} /> : null}
      <TodoCardItem model={model.item} />
      {model.draft !== null ? <TodoDraftItem model={model.draft} /> : null}
    </div>
  );
}
