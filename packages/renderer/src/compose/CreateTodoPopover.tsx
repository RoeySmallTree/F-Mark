import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import { ListChecks } from "lucide-react";
import type { TodoTreeNode } from "@f-mark/shared";
import type { PostTodoBody } from "../api/client.js";
import { createClient } from "../api/client.js";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import {
  flattenTreeForDropdown,
  generateTodoId,
  getSessionAgentIds,
  normalizeTodos,
  pickRandomAgentId,
} from "../panels/todoPanelUtils.js";
import { useStore } from "../state/store.js";
import { Popover } from "../popovers/Popover.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
  endTurnAfter: boolean;
  onCreated(): Promise<void>;
}

function participantName(
  participant: { name: string },
): string {
  return participant.name;
}

function formatParentLabel(title: string, depth: number): string {
  const trimmed = title.trim();
  const label = trimmed.length > 0 ? trimmed : "Untitled task";
  return `${"··· ".repeat(depth)}${label}`;
}

export function CreateTodoPopover({
  anchorRect,
  onClose,
  endTurnAfter,
  onCreated,
}: Props): JSX.Element {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>(() => {
    const agentIds = getSessionAgentIds(participants, sessionId);
    return pickRandomAgentId(agentIds) ?? "";
  });
  const [roots, setRoots] = useState<TodoTreeNode[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parentOptions = useMemo(
    () => flattenTreeForDropdown(roots),
    [roots],
  );
  const sessionAgentIds = useMemo(
    () => getSessionAgentIds(participants, sessionId),
    [participants, sessionId],
  );
  const participantOptions = useMemo(
    () =>
      sessionAgentIds
        .map((id) => {
          const participant = participants[id];
          if (participant === undefined) return null;
          return {
            id,
            label: participantName(participant),
          };
        })
        .filter((option): option is { id: string; label: string } => option !== null)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [participants, sessionAgentIds],
  );

  useEffect(() => {
    setAssignedTo((current) => {
      if (current.length > 0 && sessionAgentIds.includes(current)) {
        return current;
      }
      return pickRandomAgentId(sessionAgentIds) ?? "";
    });
  }, [sessionAgentIds]);

  const assignedToCurrentSessionAgent =
    assignedTo.length > 0 && sessionAgentIds.includes(assignedTo);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    setLoadingTodos(true);
    setLoadError(null);
    void (async () => {
      try {
        const todos = normalizeTodos(await client.listTodos(sessionId));
        if (!cancelled) setRoots(todos.tree);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoadingTodos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  async function submitTodo(): Promise<void> {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setSubmitError("Title is required.");
      titleRef.current?.focus();
      return;
    }
    if (sessionId === null || userId === null) {
      setSubmitError("No active session.");
      return;
    }

    const trimmedDescription = description.trim();
    const body: PostTodoBody = {
      participant_id: userId,
      id: generateTodoId(),
      title: trimmedTitle,
      status: "open",
    };
    if (trimmedDescription.length > 0) body.body = trimmedDescription;
    if (parentId.length > 0) body.parent_id = parentId;
    if (assignedToCurrentSessionAgent) body.assigned_to = assignedTo;

    setBusy(true);
    setSubmitError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const managedClient = createManagedAgentsClient({ baseUrl: "", token });
      const response = await client.postTodo(sessionId, body);
      if (
        body.assigned_to !== undefined &&
        sessionAgentIds.includes(body.assigned_to)
      ) {
        await managedClient.wakeSession(sessionId, {
          reason: "todo",
          source_event: response.filename,
          target_participant_ids: [body.assigned_to],
        });
      }
    } catch (err) {
      setBusy(false);
      setSubmitError(err instanceof Error ? err.message : String(err));
      return;
    }
    onClose();
    await onCreated();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    void submitTodo();
  }

  function onTitleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    descriptionRef.current?.focus();
  }

  function onDescriptionKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void submitTodo();
  }

  const canCreate =
    title.trim().length > 0 && !busy && sessionId !== null && userId !== null;

  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-start"
      onClose={onClose}
      className="create-todo-pop"
      ariaLabel="Create Todo"
    >
      <form className="create-todo-form" onSubmit={onSubmit}>
        <div className="pop-head">
          <ListChecks size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
          Create Todo
        </div>

        <div className="pop-section create-todo-fields">
          <div className="form-row">
            <label className="form-label" htmlFor="create-todo-title">
              Title
            </label>
            <input
              ref={titleRef}
              id="create-todo-title"
              className="form-input"
              type="text"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onTitleKeyDown}
              aria-invalid={title.trim().length === 0 && submitError !== null}
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="create-todo-description">
              Description
            </label>
            <input
              ref={descriptionRef}
              id="create-todo-description"
              className="form-input"
              type="text"
              placeholder="Task description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onDescriptionKeyDown}
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="create-todo-parent">
              Parent
            </label>
            <select
              id="create-todo-parent"
              className="form-input"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              disabled={loadingTodos}
            >
              <option value="">(no parent — root task)</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {formatParentLabel(option.title, option.depth)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="create-todo-assignee">
              Assignee
            </label>
            <select
              id="create-todo-assignee"
              className="form-input"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">(unassigned)</option>
              {participantOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {loadError !== null ? (
            <div className="create-todo-error" role="alert">
              Couldn’t load todos: {loadError}
            </div>
          ) : null}
          {submitError !== null ? (
            <div className="create-todo-error" role="alert">
              {submitError}
            </div>
          ) : null}
        </div>

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
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Popover>
  );
}
