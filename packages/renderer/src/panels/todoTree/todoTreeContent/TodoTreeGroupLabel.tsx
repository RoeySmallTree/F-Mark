import type { CSSProperties, JSX } from "react";
import type { Participant, TodoTreeNode } from "@f-mark/shared";
import {
  depthOffset,
  todoAssigneeLabel,
} from "../projection.js";
import { STATUS_GROUP_LABEL } from "../types.js";

interface TodoTreeGroupLabelProps {
  node: TodoTreeNode;
  depth: number;
  participants: Record<string, Participant>;
}

export function TodoTreeGroupLabel({
  node,
  depth,
  participants,
}: TodoTreeGroupLabelProps): JSX.Element {
  return (
    <div
      className="todo-group-label"
      data-status={node.status}
      style={
        {
          "--todo-depth-offset": depthOffset(depth),
        } as CSSProperties
      }
    >
      <span>{STATUS_GROUP_LABEL[node.status]}</span>
      <span>{todoAssigneeLabel(node, participants)}</span>
    </div>
  );
}
