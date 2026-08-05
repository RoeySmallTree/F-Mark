import type { JSX, ReactNode } from "react";
import type { Participant, TodoTreeNode } from "@f-mark/shared";
import {
  TodoItem,
  type TodoInputRefs,
} from "../../../cards/TodoItem.js";
import { nodeForItem } from "../projection.js";
import { dirtyValuesPatch } from "../todoBodies.js";
import type { TodoTreeActions } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  done: "done",
  wip: "wip",
  open: "open",
} as const;

interface TodoTreeNodeBranchProps {
  node: TodoTreeNode;
  depth: number;
  allNodeById: Map<string, TodoTreeNode>;
  participants: Record<string, Participant>;
  agentIds: string[];
  compact: boolean;
  registerInputs: (id: string, inputs: TodoInputRefs | null) => void;
  actions: TodoTreeActions;
  children?: ReactNode;
}

export function TodoTreeNodeBranch({
  node,
  depth,
  allNodeById,
  participants,
  agentIds,
  compact,
  registerInputs,
  actions,
  children,
}: TodoTreeNodeBranchProps): JSX.Element {
  const sourceNode = allNodeById.get(node.id) ?? node;
  const done = sourceNode.status === NO_LOOSE_STRING_VALUES.done;
  const wip = sourceNode.status === NO_LOOSE_STRING_VALUES.wip;

  return (
    <div className="todo-branch">
      <TodoItem
        node={nodeForItem(sourceNode)}
        depth={depth}
        participants={participants}
        agentIds={agentIds}
        compact={compact}
        registerInputs={registerInputs}
        onUpdate={async (patch) => {
          await actions.updateExisting(sourceNode, patch);
        }}
        onToggleDone={async (values) => {
          await actions.updateExisting(sourceNode, {
            ...dirtyValuesPatch(sourceNode, values),
            status: done ? NO_LOOSE_STRING_VALUES.open : NO_LOOSE_STRING_VALUES.done,
          });
        }}
        onToggleWip={async (values) => {
          await actions.updateExisting(sourceNode, {
            ...dirtyValuesPatch(sourceNode, values),
            status: wip ? NO_LOOSE_STRING_VALUES.open : NO_LOOSE_STRING_VALUES.wip,
          });
        }}
        onRemove={(field, values) =>
          actions.removeTodo(sourceNode, field, values)
        }
        fetchDescendants={() => actions.fetchDescendants(sourceNode.id)}
        onAddSubtask={async (values) => {
          const patch = dirtyValuesPatch(sourceNode, values);
          if (Object.keys(patch).length > 0) {
            const updated = await actions.updateExisting(sourceNode, patch);
            if (!updated) return;
          }
          actions.startChildDraft(sourceNode.id);
        }}
        onReassign={async (participantId, values) => {
          await actions.updateExisting(
            sourceNode,
            dirtyValuesPatch(sourceNode, values),
            participantId,
          );
        }}
        onIndent={(field, patch) =>
          actions.indentTodo(sourceNode, field, patch)
        }
        onOutdent={(field, patch) =>
          actions.outdentTodo(sourceNode, field, patch)
        }
        onFocusPrev={() => {
          actions.focusPreviousTodo(sourceNode.id);
        }}
        onFocusNext={() => {
          actions.focusNextTodo(sourceNode.id);
        }}
        onCommitAndCreateBelow={(patch) =>
          actions.commitExistingAndCreateBelow(sourceNode, patch)
        }
      />
      {children}
    </div>
  );
}
