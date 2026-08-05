import { type CSSProperties, useRef } from "react";
import { useConfirmDestructive } from "../../confirm/index.js";
import { fieldValue } from "../../panels/todoPanelUtils.js";
import {
  countDescendants,
  depthOffset,
  removeConfirmTitle,
  titleLabelFor,
  todoItemClassName,
} from "./helpers.js";
import type {
  TodoInputField,
  TodoItemController,
  TodoItemProps,
} from "./types.js";
import { useTodoAssigneeController } from "./useTodoAssigneeController.js";
import { useTodoItemInputs } from "./useTodoItemInputs.js";

const NO_LOOSE_STRING_VALUES = {
  done: "done",
  wip: "wip",
} as const;

export function useTodoItemController({
  node,
  depth,
  participants,
  agentIds,
  onUpdate,
  onToggleDone,
  onToggleWip,
  onRemove,
  onAddSubtask,
  onReassign,
  fetchDescendants,
  registerInputs,
  onIndent,
  onOutdent,
  onFocusPrev,
  onFocusNext,
  onCommitAndCreateBelow,
  titlePlaceholder = "Task title",
  autoFocusTitle = false,
  compact = false,
  draft = false,
  showAddSubtask = true,
}: TodoItemProps): TodoItemController {
  const done = node.status === NO_LOOSE_STRING_VALUES.done;
  const wip = node.status === NO_LOOSE_STRING_VALUES.wip;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const confirmDestructive = useConfirmDestructive();
  const removeRef = useRef<(field?: TodoInputField) => Promise<void>>();
  const inputs = useTodoItemInputs({
    node,
    draft,
    autoFocusTitle,
    registerInputs,
    onUpdate,
    onIndent,
    onOutdent,
    onFocusPrev,
    onFocusNext,
    onCommitAndCreateBelow,
    onRemove: async (field) => removeRef.current?.(field),
    onToggleDone,
  });
  const assigneeControl = useTodoAssigneeController({
    node,
    participants,
    agentIds,
    rootRef,
    values: inputs.values,
    onReassign,
  });

  async function remove(field?: TodoInputField): Promise<void> {
    if (draft) {
      await onRemove(field, inputs.values());
      return;
    }
    const descendantCount = await countDescendants(fetchDescendants);
    const intent = await confirmDestructive({
      action: "todo.remove",
      title: removeConfirmTitle(descendantCount),
      detail: "Removed tasks stay in the event log but leave the tree.",
    });
    if (intent === null) return;
    await onRemove(field, inputs.values());
  }
  removeRef.current = remove;

  const style = {
    "--todo-depth-offset": depthOffset(depth),
  } as CSSProperties;

  return {
    node,
    depth,
    done,
    wip,
    draft,
    showAddSubtask,
    titlePlaceholder,
    title: inputs.title,
    body: inputs.body,
    assignee: assigneeControl.assignee,
    assigneeOpen: assigneeControl.assigneeOpen,
    assigneeLabel: assigneeControl.assigneeLabel,
    participantsList: assigneeControl.participantsList,
    titleLabel: titleLabelFor(fieldValue(node.title)),
    className: todoItemClassName({ done, wip, compact, draft }),
    style,
    rootRef,
    titleRef: inputs.titleRef,
    bodyRef: inputs.bodyRef,
    assigneeButtonRef: assigneeControl.assigneeButtonRef,
    setTitle: inputs.setTitle,
    setBody: inputs.setBody,
    skipActiveInputBlurCommit: inputs.skipActiveInputBlurCommit,
    commitTitle: inputs.commitTitle,
    commitBody: inputs.commitBody,
    remove,
    selectAssignee: assigneeControl.selectAssignee,
    toggleDone: async () => onToggleDone(inputs.values()),
    toggleWip: async () => onToggleWip(inputs.values()),
    addSubtask: () => {
      void onAddSubtask(inputs.values());
    },
    toggleAssigneeMenu: assigneeControl.toggleAssigneeMenu,
    onLocalKeyDown: assigneeControl.onLocalKeyDown,
    onInputKeyDown: inputs.onInputKeyDown,
  };
}
