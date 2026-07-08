import type { JSX } from "react";
import { TodoConfirmRemove } from "./todoItem/TodoConfirmRemove.js";
import { TodoItemActions } from "./todoItem/TodoItemActions.js";
import { TodoItemDescription } from "./todoItem/TodoItemDescription.js";
import { TodoItemTitleBar } from "./todoItem/TodoItemTitleBar.js";
import type { TodoItemProps } from "./todoItem/types.js";
import { useTodoItemController } from "./todoItem/useTodoItemController.js";

export type {
  TodoInputField,
  TodoInputRefs,
  TodoItemNode,
  TodoItemValues,
} from "./todoItem/types.js";

export function TodoItem(props: TodoItemProps): JSX.Element {
  const item = useTodoItemController(props);

  return (
    <div
      ref={item.rootRef}
      className={item.className}
      data-testid={`todo-item-${item.node.id}`}
      data-depth={item.depth}
      data-status={item.node.status}
      data-draft={item.draft ? "true" : undefined}
      style={item.style}
      onKeyDown={item.onLocalKeyDown}
    >
      <div className="todo-body">
        <div className="todo-info">
          <TodoItemTitleBar
            done={item.done}
            title={item.title}
            titlePlaceholder={item.titlePlaceholder}
            titleRef={item.titleRef}
            onTitleChange={item.setTitle}
            onTitleKeyDown={item.onInputKeyDown}
            onTitleBlur={item.commitTitle}
            onToggleDone={item.toggleDone}
            onSkipActiveInputBlurCommit={item.skipActiveInputBlurCommit}
          />
          <TodoItemActions
            assignee={item.assignee}
            assigneeButtonRef={item.assigneeButtonRef}
            assigneeLabel={item.assigneeLabel}
            assigneeOpen={item.assigneeOpen}
            participantsList={item.participantsList}
            showAddSubtask={item.showAddSubtask}
            titleLabel={item.titleLabel}
            wip={item.wip}
            onAddSubtask={item.addSubtask}
            onRemove={item.remove}
            onSelectAssignee={item.selectAssignee}
            onSkipActiveInputBlurCommit={item.skipActiveInputBlurCommit}
            onToggleAssigneeMenu={item.toggleAssigneeMenu}
            onToggleWip={item.toggleWip}
          />
          <TodoItemDescription
            body={item.body}
            bodyRef={item.bodyRef}
            onBodyBlur={item.commitBody}
            onBodyChange={item.setBody}
            onBodyKeyDown={item.onInputKeyDown}
          />
        </div>
      </div>
      {item.confirmingRemove ? (
        <TodoConfirmRemove
          descendants={item.descendants}
          onCancel={item.cancelRemoveConfirmation}
          onRemove={item.remove}
        />
      ) : null}
    </div>
  );
}
