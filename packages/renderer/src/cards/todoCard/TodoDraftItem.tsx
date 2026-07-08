import type { JSX } from "react";
import { TodoItem } from "../TodoItem.js";
import type { TodoDraftItemModel } from "./types.js";

interface TodoDraftItemProps {
  model: TodoDraftItemModel;
}

export function TodoDraftItem({ model }: TodoDraftItemProps): JSX.Element {
  return (
    <TodoItem
      node={model.node}
      depth={model.depth}
      participants={model.participants}
      agentIds={model.agentIds}
      draft={model.draft}
      showAddSubtask={model.showAddSubtask}
      autoFocusTitle={model.autoFocusTitle}
      {...model.handlers}
    />
  );
}
