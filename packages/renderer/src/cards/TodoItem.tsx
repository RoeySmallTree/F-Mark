import {
  type CSSProperties,
  type KeyboardEvent,
  type JSX,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Participant, TodoPayload, TodoTreeNode } from "@f-mark/shared";
import { Check, CornerDownRight, Plus, X } from "lucide-react";
import { fieldValue, countDescendants } from "../panels/todoPanelUtils.js";
import { whoOf } from "./format.js";

export interface TodoItemNode {
  id: string;
  title: string;
  body?: string;
  status: TodoPayload["status"];
  assigned_to?: string;
  parent_id?: string;
  children: TodoTreeNode[];
}

export type TodoInputField = "title" | "body";

export interface TodoInputRefs {
  title: HTMLInputElement;
  body: HTMLTextAreaElement;
}

interface TodoItemProps {
  node: TodoItemNode;
  depth: number;
  participants: Record<string, Participant>;
  agentIds: string[];
  onUpdate: (patch: Partial<TodoPayload>) => Promise<void>;
  onToggleDone: () => Promise<void>;
  onRemove: (field?: TodoInputField) => Promise<void>;
  onAddSubtask: () => Promise<void> | void;
  onReassign: (participantId: string | null) => Promise<void>;
  registerInputs?: (id: string, inputs: TodoInputRefs | null) => void;
  onIndent?: (
    field: TodoInputField,
    patch: { title: string; body: string },
  ) => Promise<void> | void;
  onOutdent?: (
    field: TodoInputField,
    patch: { title: string; body: string },
  ) => Promise<void> | void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  onCommitAndCreateBelow?: (
    patch: { title: string; body: string },
  ) => Promise<void> | void;
  titlePlaceholder?: string;
  autoFocusTitle?: boolean;
  compact?: boolean;
  draft?: boolean;
  showAddSubtask?: boolean;
}

function depthOffset(depth: number): string {
  if (depth <= 0) return "0px";
  return `calc(${Array.from({ length: depth }, () => "var(--todo-indent-step)").join(" + ")})`;
}

function participantEntries(
  participants: Record<string, Participant>,
): Array<[string, Participant]> {
  return Object.entries(participants).sort(([, a], [, b]) => {
    if (a.kind !== b.kind) return a.kind === "user" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function TodoItem({
  node,
  depth,
  participants,
  agentIds: _agentIds,
  onUpdate,
  onToggleDone,
  onRemove,
  onAddSubtask,
  onReassign,
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
}: TodoItemProps): JSX.Element {
  const done = node.status === "done";
  const [title, setTitle] = useState(fieldValue(node.title));
  const [body, setBody] = useState(fieldValue(node.body));
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeButtonRef = useRef<HTMLButtonElement | null>(null);
  const skipBlurCommitRef = useRef<TodoInputField | null>(null);
  const descendants = countDescendants(node);

  useEffect(() => {
    setTitle(fieldValue(node.title));
  }, [node.id, node.title]);

  useEffect(() => {
    setBody(fieldValue(node.body));
  }, [node.id, node.body]);

  useEffect(() => {
    if (!autoFocusTitle) return;
    const input = titleRef.current;
    if (input === null) return;
    input.focus();
    input.select();
  }, [autoFocusTitle, node.id]);

  useEffect(() => {
    if (registerInputs === undefined) return;
    const titleInput = titleRef.current;
    const bodyInput = bodyRef.current;
    if (titleInput === null || bodyInput === null) return;
    registerInputs(node.id, { title: titleInput, body: bodyInput });
    return () => {
      registerInputs(node.id, null);
    };
  }, [node.id, registerInputs]);

  useEffect(() => {
    if (!assigneeOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) === true) return;
      setAssigneeOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [assigneeOpen]);

  const assignee = node.assigned_to
    ? whoOf(node.assigned_to, participants)
    : null;

  const participantsList = useMemo(
    () => participantEntries(participants),
    [participants],
  );

  async function commitTitle(): Promise<void> {
    if (skipBlurCommitRef.current === "title") {
      skipBlurCommitRef.current = null;
      return;
    }
    const previous = fieldValue(node.title);
    if (title === previous) return;
    if (draft && title.trim().length === 0) return;
    await onUpdate({ title, body });
  }

  async function commitBody(): Promise<void> {
    if (skipBlurCommitRef.current === "body") {
      skipBlurCommitRef.current = null;
      return;
    }
    const previous = fieldValue(node.body);
    if (body === previous) return;
    await onUpdate({ title, body });
  }

  async function remove(): Promise<void> {
    if (descendants > 0 && !confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    await onRemove();
    setConfirmingRemove(false);
  }

  async function selectAssignee(participantId: string | null): Promise<void> {
    await onReassign(participantId);
    setAssigneeOpen(false);
    assigneeButtonRef.current?.focus();
  }

  function onLocalKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || !assigneeOpen) return;
    event.stopPropagation();
    setAssigneeOpen(false);
    assigneeButtonRef.current?.focus();
  }

  function onInputKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: TodoInputField,
  ): void {
    const isMod = event.metaKey || event.ctrlKey;

    if (event.key === "Tab") {
      const handler = event.shiftKey ? onOutdent : onIndent;
      if (handler === undefined) return;
      event.preventDefault();
      void handler(field, { title, body });
      return;
    }

    if (event.key === "Enter" && isMod) {
      event.preventDefault();
      void onToggleDone();
      return;
    }

    if (event.key === "Backspace" && isMod) {
      event.preventDefault();
      skipBlurCommitRef.current = field;
      void onRemove(field);
      return;
    }

    if (event.key === "Enter" && field === "title") {
      event.preventDefault();
      bodyRef.current?.focus();
      return;
    }

    if (event.key === "Enter" && field === "body") {
      if (onCommitAndCreateBelow === undefined) return;
      event.preventDefault();
      skipBlurCommitRef.current = "body";
      void onCommitAndCreateBelow({ title, body });
      return;
    }

    if (event.key === "ArrowUp") {
      if (onFocusPrev === undefined) return;
      event.preventDefault();
      onFocusPrev();
      return;
    }

    if (event.key === "ArrowDown") {
      if (onFocusNext === undefined) return;
      event.preventDefault();
      onFocusNext();
    }
  }

  const style = {
    "--todo-depth-offset": depthOffset(depth),
  } as CSSProperties;

  const titleLabel =
    fieldValue(node.title).length > 0 ? fieldValue(node.title) : "untitled task";

  return (
    <div
      ref={rootRef}
      className={[
        "todo-item",
        done ? "done" : "",
        compact ? "compact" : "",
        draft ? "draft" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`todo-item-${node.id}`}
      data-depth={depth}
      data-draft={draft ? "true" : undefined}
      style={style}
      onKeyDown={onLocalKeyDown}
    >
      <div className="todo-body">
        <button
          type="button"
          className={["todo-check", done ? "done" : ""].join(" ").trim()}
          aria-pressed={done}
          aria-label={done ? "Mark as open" : "Mark as done"}
          onClick={() => void onToggleDone()}
        >
          {done ? <Check size={12} strokeWidth={3.2} aria-hidden /> : null}
        </button>
        <div className="todo-info">
          <input
            ref={titleRef}
            className="todo-title"
            value={title}
            placeholder={titlePlaceholder}
            aria-label="Task title"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => onInputKeyDown(event, "title")}
            onBlur={() => void commitTitle()}
          />
          <textarea
            ref={bodyRef}
            className="todo-desc"
            value={body}
            placeholder="Task description (optional)"
            aria-label="Task description"
            rows={1}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => onInputKeyDown(event, "body")}
            onBlur={() => void commitBody()}
          />
          <div className="todo-meta">
            <div className="todo-assignee">
              <button
                ref={assigneeButtonRef}
                type="button"
                className={[
                  "assign-badge",
                  assignee === null ? "unassigned" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-haspopup="menu"
                aria-expanded={assigneeOpen}
                aria-label={
                  assignee === null
                    ? "unassigned"
                    : `assigned to ${assignee.name}`
                }
                onClick={() => setAssigneeOpen((value) => !value)}
              >
                {assignee !== null ? (
                  <span
                    className={[
                      "avatar",
                      assignee.isUser ? "user" : "agent",
                      "sm",
                    ].join(" ")}
                    aria-hidden
                  >
                    {assignee.initial}
                  </span>
                ) : null}
                {assignee === null ? "unassigned" : `assigned to ${assignee.name}`}
              </button>
              {assigneeOpen ? (
                <div className="todo-assignee-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="todo-assignee-option"
                    onClick={() => void selectAssignee(null)}
                  >
                    <span className="avatar sm ghost" aria-hidden>
                      -
                    </span>
                    Unassign
                  </button>
                  {participantsList.map(([participantId, participant]) => {
                    const who = whoOf(participantId, participants);
                    return (
                      <button
                        key={participantId}
                        type="button"
                        role="menuitem"
                        className="todo-assignee-option"
                        onClick={() => void selectAssignee(participantId)}
                      >
                        <span
                          className={[
                            "avatar",
                            participant.kind === "user" ? "user" : "agent",
                            "sm",
                          ].join(" ")}
                          aria-hidden
                        >
                          {who.initial}
                        </span>
                        {who.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {showAddSubtask ? (
              <button
                type="button"
                className="todo-icon-btn"
                aria-label={`Add subtask to ${titleLabel}`}
                title="Add subtask"
                onClick={() => void onAddSubtask()}
              >
                <CornerDownRight size={13} aria-hidden />
                <Plus size={12} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="todo-icon-btn danger"
              aria-label={`Remove task ${titleLabel}`}
              title="Remove"
              onClick={() => void remove()}
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {confirmingRemove ? (
        <div className="todo-confirm" role="alert">
          <span>
            Remove this task and {descendants}{" "}
            {descendants === 1 ? "subtask" : "subtasks"}?
          </span>
          <button type="button" onClick={() => void remove()}>
            Remove
          </button>
          <button type="button" onClick={() => setConfirmingRemove(false)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
