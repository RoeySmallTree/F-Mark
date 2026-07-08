import type { JSX } from "react";
import { TodoItem } from "../TodoItem.js";
import type { TodoCardItemModel } from "./types.js";

interface TodoCardItemProps {
  model: TodoCardItemModel;
}

export function TodoCardItem({ model }: TodoCardItemProps): JSX.Element {
  return (
    <TodoItem
      node={model.node}
      depth={model.depth}
      participants={model.participants}
      agentIds={model.agentIds}
      {...model.handlers}
    />
  );
}
