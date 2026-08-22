import type { JSX } from "react";
import { ListChecks } from "lucide-react";
import { Popover } from "../../popovers/Popover.js";
import { formatParentLabel } from "./model.js";
import type {
  CreateTodoPopoverController,
  CreateTodoPopoverProps,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  creating: "Creating…",
  create: "Create",
} as const;

interface CreateTodoPopoverViewProps
  extends Pick<CreateTodoPopoverProps, "anchorRect" | "onClose" | "endTurnAfter"> {
  controller: CreateTodoPopoverController;
  closing?: boolean;
}

export function CreateTodoPopoverView({
  anchorRect,
  onClose,
  endTurnAfter,
  controller,
  closing,
}: CreateTodoPopoverViewProps): JSX.Element {
  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-start"
      onClose={onClose}
      closing={closing}
      className="create-todo-pop"
      ariaLabel="Create Todo"
    >
      <form className="create-todo-form" onSubmit={controller.onSubmit}>
        <CreateTodoHeader />
        <TodoFormFields controller={controller} />
        <TodoFormActions
          busy={controller.busy}
          canCreate={controller.canCreate}
          endTurnAfter={endTurnAfter}
          onClose={onClose}
        />
      </form>
    </Popover>
  );
}

function CreateTodoHeader(): JSX.Element {
  return (
    <div className="pop-head">
      <ListChecks size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
      Create Todo
    </div>
  );
}

function TodoFormFields({
  controller,
}: {
  controller: CreateTodoPopoverController;
}): JSX.Element {
  return (
    <div className="pop-section create-todo-fields">
      <TodoTextFields controller={controller} />
      <TodoParentField controller={controller} />
      <TodoAssigneeField controller={controller} />
      <TodoErrors controller={controller} />
    </div>
  );
}

function TodoTextFields({
  controller,
}: {
  controller: CreateTodoPopoverController;
}): JSX.Element {
  return (
    <>
      <div className="form-row">
        <label className="form-label" htmlFor="create-todo-title">
          Title
        </label>
        <input
          ref={controller.titleRef}
          id="create-todo-title"
          className="form-input"
          type="text"
          placeholder="Task title"
          value={controller.title}
          onChange={(e) => controller.setTitle(e.target.value)}
          onKeyDown={controller.onTitleKeyDown}
          aria-invalid={
            controller.title.trim().length === 0 &&
            controller.submitError !== null
          }
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="create-todo-description">
          Description
        </label>
        <input
          ref={controller.descriptionRef}
          id="create-todo-description"
          className="form-input"
          type="text"
          placeholder="Task description (optional)"
          value={controller.description}
          onChange={(e) => controller.setDescription(e.target.value)}
          onKeyDown={controller.onDescriptionKeyDown}
        />
      </div>
    </>
  );
}

function TodoParentField({
  controller,
}: {
  controller: CreateTodoPopoverController;
}): JSX.Element {
  return (
    <div className="form-row">
      <label className="form-label" htmlFor="create-todo-parent">
        Parent
      </label>
      <select
        id="create-todo-parent"
        className="form-input"
        value={controller.parentId}
        onChange={(e) => controller.setParentId(e.target.value)}
        disabled={controller.loadingTodos}
      >
        <option value="">(no parent — root task)</option>
        {controller.parentOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {formatParentLabel(option.title, option.depth)}
          </option>
        ))}
      </select>
    </div>
  );
}

function TodoAssigneeField({
  controller,
}: {
  controller: CreateTodoPopoverController;
}): JSX.Element {
  return (
    <div className="form-row">
      <label className="form-label" htmlFor="create-todo-assignee">
        Assignee
      </label>
      <select
        id="create-todo-assignee"
        className="form-input"
        value={controller.assignedTo}
        onChange={(e) => controller.setAssignedTo(e.target.value)}
      >
        <option value="">(unassigned)</option>
        {controller.participantOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TodoErrors({
  controller,
}: {
  controller: CreateTodoPopoverController;
}): JSX.Element {
  return (
    <>
      {controller.loadError !== null ? (
        <div className="create-todo-error" role="alert">
          Couldn’t load todos: {controller.loadError}
        </div>
      ) : null}
      {controller.submitError !== null ? (
        <div className="create-todo-error" role="alert">
          {controller.submitError}
        </div>
      ) : null}
    </>
  );
}

function TodoFormActions({
  busy,
  canCreate,
  endTurnAfter,
  onClose,
}: {
  busy: boolean;
  canCreate: boolean;
  endTurnAfter: boolean;
  onClose(): void;
}): JSX.Element {
  return (
    <div className="pop-foot create-todo-actions">
      <button
        type="button"
        className="btn-ghost"
        onClick={onClose}
        disabled={busy}
      >
        Cancel
      </button>
      <button
        type="submit"
        className="btn-solid"
        disabled={!canCreate}
        title={endTurnAfter ? "Create todo and end turn" : "Create todo"}
      >
        {busy ? NO_LOOSE_STRING_VALUES.creating : NO_LOOSE_STRING_VALUES.create}
      </button>
    </div>
  );
}
