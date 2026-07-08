import {
  type JSX,
  type MutableRefObject,
} from "react";
import {
  generateTodoId,
  pickRandomAgentId,
} from "../todoPanelUtils.js";
import { TodoTreeAddRow, TodoTreeMessages } from "./TodoTreeChrome.js";
import {
  TodoTreeContent,
  type TodoTreeContentProps,
} from "./TodoTreeContent.js";

interface TodoTreePanelProps extends TodoTreeContentProps {
  currentSessionId: string | null;
  actorId: string | null;
  loadError: string | null;
  actionError: string | null;
  addRowRef: MutableRefObject<HTMLButtonElement | null>;
}

export function TodoTreePanel({
  draft,
  setDraft,
  agentIds,
  currentSessionId,
  actorId,
  loadError,
  actionError,
  addRowRef,
  ...contentProps
}: TodoTreePanelProps): JSX.Element {
  function startRootDraft(): void {
    setDraft({
      id: generateTodoId(),
      assignedTo: pickRandomAgentId(agentIds),
    });
  }

  return (
    <div className="todo-tree">
      <TodoTreeContent
        draft={draft}
        setDraft={setDraft}
        agentIds={agentIds}
        {...contentProps}
      />
      {draft === null ? (
        <TodoTreeAddRow
          addRowRef={addRowRef}
          onClick={startRootDraft}
          disabled={currentSessionId === null || actorId === null}
        />
      ) : null}
      <TodoTreeMessages loadError={loadError} actionError={actionError} />
    </div>
  );
}
