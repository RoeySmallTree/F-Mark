import { type JSX, useEffect, useMemo, useState } from "react";
import { flattenTree } from "./todoPanelUtils.js";
import {
  collectNodeMap,
  createFlatById,
  todoCounts,
  visibleOrderedTree,
} from "./todoTree/projection.js";
import { StatusFilterControls } from "./todoTree/StatusFilterControls.js";
import { TodoTreePanel } from "./todoTree/TodoTreePanel.js";
import type { DraftTodo, TodoTreeListProps } from "./todoTree/types.js";
import { useAutoFirstDraft } from "./todoTree/useAutoFirstDraft.js";
import { useStatusFilters } from "./todoTree/useStatusFilters.js";
import { useTodoFocus } from "./todoTree/useTodoFocus.js";
import { useTodoMutations } from "./todoTree/useTodoMutations.js";
import { useTodoTreeData } from "./todoTree/useTodoTreeData.js";

export function TodoTreeList({
  className,
  compact = false,
  showCounts = true,
}: TodoTreeListProps): JSX.Element {
  const [draft, setDraft] = useState<DraftTodo | null>(null);
  const {
    currentSessionId,
    actorId,
    participants,
    agentIds,
    todos,
    loadedSessionId,
    loadError,
    actionError,
    setActionError,
    latestById,
    postTodo,
    fetchDescendants,
  } = useTodoTreeData();
  const {
    addRowRef,
    pendingFocusRef,
    registerInputs,
    focusTodo,
    resetTodoFocusRegistry,
  } = useTodoFocus({ draft, todos });
  const { statusFilters, toggleStatusFilter } = useStatusFilters();

  useEffect(() => {
    setDraft(null);
    resetTodoFocusRegistry();
  }, [currentSessionId, resetTodoFocusRegistry]);

  const allNodeById = useMemo(() => collectNodeMap(todos.tree), [todos.tree]);
  const visibleTree = useMemo(
    () => visibleOrderedTree(todos.tree, statusFilters, participants),
    [todos.tree, statusFilters, participants],
  );
  const flat = useMemo(() => flattenTree(visibleTree), [visibleTree]);
  const flatById = useMemo(() => createFlatById(flat), [flat]);
  const counts = useMemo(() => todoCounts(todos), [todos]);
  const { updateExisting, createDraft } = useTodoMutations({
    actorId,
    agentIds,
    draft,
    latestById,
    postTodo,
    setActionError,
    setDraft,
  });

  useAutoFirstDraft({
    currentSessionId,
    actorId,
    loadedSessionId,
    loadError,
    todos,
    draft,
    agentIds,
    setDraft,
  });

  return (
    <div className={className}>
      {showCounts ? (
        <StatusFilterControls
          counts={counts}
          statusFilters={statusFilters}
          onToggleStatus={toggleStatusFilter}
        />
      ) : null}
      <TodoTreePanel
        nodes={visibleTree}
        allNodeById={allNodeById}
        draft={draft}
        setDraft={setDraft}
        participants={participants}
        agentIds={agentIds}
        compact={compact}
        flat={flat}
        flatById={flatById}
        currentSessionId={currentSessionId}
        actorId={actorId}
        loadError={loadError}
        actionError={actionError}
        addRowRef={addRowRef}
        pendingFocusRef={pendingFocusRef}
        registerInputs={registerInputs}
        focusTodo={focusTodo}
        updateExisting={updateExisting}
        createDraft={createDraft}
        fetchDescendants={fetchDescendants}
      />
    </div>
  );
}
