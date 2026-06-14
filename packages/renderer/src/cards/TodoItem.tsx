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
import { Check, CircleDot, CornerDownRight, Plus, User, X } from "lucide-react";
import { fieldValue, countDescendants } from "../panels/todoPanelUtils.js";
import { whoOf } from "./format.js";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";
import { LogLevel, useSeqLog } from "../hooks/useSeqLog.js";

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

export interface TodoItemValues {
  title: string;
  body: string;
}

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
  onToggleDone: (values: TodoItemValues) => Promise<void>;
  onToggleWip: (values: TodoItemValues) => Promise<void>;
  onRemove: (
    field?: TodoInputField,
    values?: TodoItemValues,
  ) => Promise<void>;
  onAddSubtask: (values: TodoItemValues) => Promise<void> | void;
  onReassign: (
    participantId: string | null,
    values: TodoItemValues,
  ) => Promise<void>;
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
  agentIds: string[],
): Array<[string, Participant]> {
  return agentIds
    .map((id): [string, Participant] | null => {
      const participant = participants[id];
      return participant === undefined ? null : [id, participant];
    })
    .filter((entry): entry is [string, Participant] => entry !== null)
    .sort(([, a], [, b]) => {
      return a.name.localeCompare(b.name);
    });
}

export function TodoItem({
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
  const wip = node.status === "wip";
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
    () => participantEntries(participants, agentIds),
    [participants, agentIds],
  );

  function currentValues(): TodoItemValues {
    return { title, body };
  }

  function skipActiveInputBlurCommit(): void {
    if (document.activeElement === titleRef.current) {
      skipBlurCommitRef.current = "title";
    } else if (document.activeElement === bodyRef.current) {
      skipBlurCommitRef.current = "body";
    }
  }

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
    await onRemove(undefined, currentValues());
    setConfirmingRemove(false);
  }

  async function selectAssignee(participantId: string | null): Promise<void> {
    await onReassign(participantId, currentValues());
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
      void onToggleDone(currentValues());
      return;
    }

    if (event.key === "Backspace" && isMod) {
      event.preventDefault();
      skipBlurCommitRef.current = field;
      void onRemove(field, currentValues());
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
  const log = useSeqLog("TodoItem", { todoId: node.id });
  const assigneeLabel =
    assignee === null ? "Unassigned" : `Assigned to ${assignee.name}`;

  return (
    <div
      ref={rootRef}
      className={[
        "todo-item",
        done ? "done" : "",
        wip ? "wip" : "",
        compact ? "compact" : "",
        draft ? "draft" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`todo-item-${node.id}`}
      data-depth={depth}
      data-status={node.status}
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
          onMouseDown={skipActiveInputBlurCommit}
          onClick={() => {
            log(
              "TodoItem check toggled",
              { previousStatus: node.status },
              LogLevel.Info,
            );
            void onToggleDone(currentValues());
          }}
        >
          {done ? <Check size={12} strokeWidth={3.2} aria-hidden /> : null}
        </button>
        <div className="todo-info">
          <div className="todo-top-row">
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
            <div className="todo-actions" role="group" aria-label="Task actions">
              {wip ? (
                <span
                  className="todo-status-pill wip"
                  aria-hidden="true"
                  title="In progress"
                >
                  ●
                </span>
              ) : null}
              <div className="todo-assignee">
                <button
                  ref={assigneeButtonRef}
                  type="button"
                  className={[
                    "assign-badge",
                    "icon-only",
                    assignee === null ? "unassigned" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-haspopup="menu"
                  aria-expanded={assigneeOpen}
                  aria-label={assigneeLabel}
                  title={assigneeLabel}
                  onClick={() => {
                    log(
                      "TodoItem assignee dropdown toggled",
                      { currentAssignee: node.assigned_to ?? null },
                      LogLevel.Info,
                    );
                    setAssigneeOpen((value) => !value);
                  }}
                >
                  {assignee !== null ? (
                    <ParticipantAvatar
                      participantId={assignee.id}
                      kind={assignee.isUser ? "user" : "agent"}
                      name={assignee.name}
                      color={assignee.color}
                      runtimeId={assignee.runtimeId}
                      size="sm"
                    />
                  ) : (
                    <User size={13} aria-hidden />
                  )}
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
                          <ParticipantAvatar
                            participantId={participantId}
                            participant={participant}
                            kind={participant.kind}
                            name={who.name}
                            color={participant.color}
                            runtimeId={participant.runtime_id ?? null}
                            size="sm"
                          />
                          {who.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={["todo-icon-btn", "todo-wip-btn", wip ? "active" : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={wip}
                aria-label={wip ? "Mark as open" : "Mark as in progress"}
                title={wip ? "Mark as open" : "Mark as in progress"}
                onMouseDown={skipActiveInputBlurCommit}
                onClick={() => {
                  log(
                    "TodoItem wip toggled",
                    { previousStatus: node.status },
                    LogLevel.Info,
                  );
                  void onToggleWip(currentValues());
                }}
              >
                <CircleDot size={13} aria-hidden />
              </button>
              {showAddSubtask ? (
                <button
                  type="button"
                  className="todo-icon-btn"
                  aria-label={`Add subtask to ${titleLabel}`}
                  title="Add subtask"
                  onMouseDown={skipActiveInputBlurCommit}
                  onClick={() => {
                    log("TodoItem add subtask clicked", {}, LogLevel.Info);
                    void onAddSubtask(currentValues());
                  }}
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
                onMouseDown={skipActiveInputBlurCommit}
                onClick={() => {
                  log(
                    "TodoItem remove clicked",
                    { descendants, status: node.status },
                    LogLevel.Info,
                  );
                  void remove();
                }}
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          </div>
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
