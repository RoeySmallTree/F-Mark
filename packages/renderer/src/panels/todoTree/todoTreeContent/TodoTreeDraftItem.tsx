import type { JSX } from "react";
import type { Participant } from "@f-mark/shared";
import {
  TodoItem,
  type TodoInputRefs,
} from "../../../cards/TodoItem.js";
import { draftNode } from "../projection.js";
import type { DraftTodo } from "../types.js";
import type { TodoTreeActions } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  done: "done",
  wip: "wip",
} as const;

interface TodoTreeDraftItemProps {
  currentDraft: DraftTodo;
  depth: number;
  participants: Record<string, Participant>;
  agentIds: string[];
  compact: boolean;
  registerInputs: (id: string, inputs: TodoInputRefs | null) => void;
  actions: TodoTreeActions;
}

export function TodoTreeDraftItem({
  currentDraft,
  depth,
  participants,
  agentIds,
  compact,
  registerInputs,
  actions,
}: TodoTreeDraftItemProps): JSX.Element {
  return (
    <TodoItem
      node={draftNode(currentDraft)}
      depth={depth}
      participants={participants}
      agentIds={agentIds}
      compact={compact}
      draft
      showAddSubtask={false}
      autoFocusTitle
      registerInputs={registerInputs}
      onUpdate={async (patch) => {
        await actions.createDraft(currentDraft, patch);
      }}
      onToggleDone={async (values) => {
        await actions.createDraft(currentDraft, {
          ...values,
          status: NO_LOOSE_STRING_VALUES.done,
        });
      }}
      onToggleWip={async (values) => {
        await actions.createDraft(currentDraft, { ...values, status: NO_LOOSE_STRING_VALUES.wip });
      }}
      onRemove={async () => {
        actions.clearDraft();
      }}
      fetchDescendants={() => Promise.resolve([])}
      onAddSubtask={(values) =>
        actions.createChildDraftFromDraft(currentDraft, values)
      }
      onReassign={async (participantId) => {
        actions.updateDraftAssignee(currentDraft, participantId);
      }}
      onCommitAndCreateBelow={(patch) =>
        actions.commitDraftAndCreateBelow(currentDraft, patch)
      }
      onIndent={() => {
        actions.indentDraft(currentDraft, depth);
      }}
      onOutdent={() => {
        actions.outdentDraft(currentDraft);
      }}
      onFocusPrev={() => {
        actions.focusPreviousDraft(currentDraft);
      }}
    />
  );
}
