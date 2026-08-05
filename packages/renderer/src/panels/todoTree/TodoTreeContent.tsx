import type { JSX } from "react";
import { TodoTreeDraftItem } from "./todoTreeContent/TodoTreeDraftItem.js";
import { TodoTreeLevel } from "./todoTreeContent/TodoTreeLevel.js";
import type { TodoTreeContentProps } from "./todoTreeContent/types.js";
import { useTodoTreeActions } from "./todoTreeContent/useTodoTreeActions.js";

export type { TodoTreeContentProps } from "./todoTreeContent/types.js";

export function TodoTreeContent({
  nodes,
  allNodeById,
  draft,
  setDraft,
  participants,
  agentIds,
  compact,
  flat,
  flatById,
  pendingFocusRef,
  registerInputs,
  focusTodo,
  updateExisting,
  createDraft,
  fetchDescendants,
}: TodoTreeContentProps): JSX.Element {
  const actions = useTodoTreeActions({
    agentIds,
    createDraft,
    fetchDescendants,
    flat,
    flatById,
    focusTodo,
    pendingFocusRef,
    setDraft,
    updateExisting,
  });

  const shouldRenderRootDraft =
    draft !== null &&
    draft.parentId === undefined &&
    draft.afterId === undefined;
  const isFilteredToZero = nodes.length === 0 && allNodeById.size > 0;

  return (
    <>
      <TodoTreeLevel
        nodes={nodes}
        depth={0}
        draft={draft}
        allNodeById={allNodeById}
        participants={participants}
        agentIds={agentIds}
        compact={compact}
        registerInputs={registerInputs}
        actions={actions}
      />
      {isFilteredToZero ? (
        <p className="panel-empty">No tasks match the current filter.</p>
      ) : null}
      {shouldRenderRootDraft && draft !== null ? (
        <TodoTreeDraftItem
          currentDraft={draft}
          depth={0}
          participants={participants}
          agentIds={agentIds}
          compact={compact}
          registerInputs={registerInputs}
          actions={actions}
        />
      ) : null}
    </>
  );
}
