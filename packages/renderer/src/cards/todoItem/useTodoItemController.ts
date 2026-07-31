import { type CSSProperties, useRef } from "react";
import { useConfirmDestructive } from "../../confirm/index.js";
import { countDescendants, fieldValue } from "../../panels/todoPanelUtils.js";
import {
  depthOffset,
  removeConfirmTitle,
  titleLabelFor,
  todoItemClassName,
} from "./helpers.js";
import type { TodoItemController, TodoItemProps } from "./types.js";
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
    onRemove,
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

  async function remove(): Promise<void> {
    if (draft) {
      await onRemove(undefined, inputs.values());
      return;
    }
    const descendantCount =
      fetchDescendants === undefined
        ? countDescendants(node)
        : (await fetchDescendants()).length;
    const intent = await confirmDestructive({
      action: "todo.remove",
      title: removeConfirmTitle(descendantCount),
      detail: "Removed tasks stay in the event log but leave the tree.",
    });
    if (intent === null) return;
    await onRemove(undefined, inputs.values());
  }

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
