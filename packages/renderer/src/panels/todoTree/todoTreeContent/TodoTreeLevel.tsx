import type { JSX } from "react";
import type { Participant, TodoTreeNode } from "@f-mark/shared";
import type { TodoInputRefs } from "../../../cards/TodoItem.js";
import { todoGroupKey } from "../projection.js";
import type { DraftTodo } from "../types.js";
import { TodoTreeDraftItem } from "./TodoTreeDraftItem.js";
import { TodoTreeGroupLabel } from "./TodoTreeGroupLabel.js";
import { TodoTreeNodeBranch } from "./TodoTreeNodeBranch.js";
import type { TodoTreeActions } from "./types.js";

interface TodoTreeLevelProps {
  nodes: TodoTreeNode[];
  depth: number;
  draft: DraftTodo | null;
  allNodeById: Map<string, TodoTreeNode>;
  participants: Record<string, Participant>;
  agentIds: string[];
  compact: boolean;
  registerInputs: (id: string, inputs: TodoInputRefs | null) => void;
  actions: TodoTreeActions;
}

export function TodoTreeLevel({
  nodes,
  depth,
  draft,
  allNodeById,
  participants,
  agentIds,
  compact,
  registerInputs,
  actions,
}: TodoTreeLevelProps): JSX.Element {
  const elements: JSX.Element[] = [];
  const groupCount = new Set(nodes.map(todoGroupKey)).size;
  let previousGroupKey: string | null = null;

  for (const node of nodes) {
    const nextGroupKey = todoGroupKey(node);
    if (groupCount > 1 && nextGroupKey !== previousGroupKey) {
      elements.push(
        <TodoTreeGroupLabel
          key={`group-${depth}-${nextGroupKey}`}
          node={node}
          depth={depth}
          participants={participants}
        />,
      );
      previousGroupKey = nextGroupKey;
    }

    elements.push(
      <TodoTreeNodeBranch
        key={node.id}
        node={node}
        depth={depth}
        allNodeById={allNodeById}
        participants={participants}
        agentIds={agentIds}
        compact={compact}
        registerInputs={registerInputs}
        actions={actions}
      >
        <TodoTreeLevel
          nodes={node.children}
          depth={depth + 1}
          draft={draft}
          allNodeById={allNodeById}
          participants={participants}
          agentIds={agentIds}
          compact={compact}
          registerInputs={registerInputs}
          actions={actions}
        />
        {draft?.parentId === node.id && draft.afterId === undefined ? (
          <TodoTreeDraftItem
            key={draft.id}
            currentDraft={draft}
            depth={depth + 1}
            participants={participants}
            agentIds={agentIds}
            compact={compact}
            registerInputs={registerInputs}
            actions={actions}
          />
        ) : null}
      </TodoTreeNodeBranch>,
    );

    if (
      draft !== null &&
      draft.parentId === node.parent_id &&
      draft.afterId === node.id
    ) {
      elements.push(
        <TodoTreeDraftItem
          key={draft.id}
          currentDraft={draft}
          depth={depth}
          participants={participants}
          agentIds={agentIds}
          compact={compact}
          registerInputs={registerInputs}
          actions={actions}
        />,
      );
    }
  }

  return <>{elements}</>;
}
