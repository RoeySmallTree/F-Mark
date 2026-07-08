import type { Dispatch, SetStateAction } from "react";
import {
  TODO_STATUSES,
  type Participant,
  type TodoPayload,
} from "@f-mark/shared";
import {
  generateTodoId,
  nextIndentParentId,
  nextOutdentParentId,
  pickRandomAgentId,
  type FlattenedTodo,
} from "../../panels/todoPanelUtils.js";
import type { WhoInfo } from "../format.js";
import type { TodoItemNode, TodoItemValues } from "../TodoItem.js";
import { dirtyTodoCardValuesPatch } from "./todoCardMutation.js";
import { focusInlineTodo, nodeFromDraft } from "./todoNodes.js";
import type {
  InlineDraft,
  TodoCardContainerModel,
  TodoCardHeaderModel,
  TodoCardItemModel,
  TodoDraftItemModel,
  TodoItemHandlers,
} from "./types.js";

const todoCardClassNames = {
  card: "todo-card",
  done: "done",
  removed: "removed",
  empty: "",
  joiner: " ",
} as const;

const todoCardVariants = {
  embedded: "embedded",
} as const;

const todoTreeSentinels = {
  root: "ROOT",
} as const;

interface TodoCardItemModelInput {
  node: TodoItemNode;
  depth: number;
  participants: Record<string, Participant>;
  agentIds: string[];
  payloadId: string;
  done: boolean;
  wip: boolean;
  flat: FlattenedTodo[];
  flatById: Map<string, FlattenedTodo>;
  setDraft: Dispatch<SetStateAction<InlineDraft | null>>;
  updateTodo: (
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ) => Promise<void>;
  saveDirtyThen: (
    values: TodoItemValues,
    next: () => void,
  ) => Promise<void>;
  reparent: (values: TodoItemValues, parentId: string | null) => Promise<void>;
}

interface TodoDraftItemModelInput {
  draft: InlineDraft;
  node: TodoItemNode;
  depth: number;
  participants: Record<string, Participant>;
  agentIds: string[];
  payloadId: string;
  setDraft: Dispatch<SetStateAction<InlineDraft | null>>;
  createDraft: (
    currentDraft: InlineDraft,
    values: TodoItemValues,
    status?: TodoPayload["status"],
  ) => Promise<boolean>;
}

export function buildTodoCardContainerModel(
  payloadId: string,
  done: boolean,
  removed: boolean,
): TodoCardContainerModel {
  return {
    className: [
      todoCardClassNames.card,
      done ? todoCardClassNames.done : todoCardClassNames.empty,
      removed ? todoCardClassNames.removed : todoCardClassNames.empty,
    ]
      .filter(Boolean)
      .join(todoCardClassNames.joiner),
    inlineTodoId: payloadId,
  };
}

export function buildTodoCardHeaderModel(
  variant: "standalone" | "embedded",
  who: WhoInfo,
  timestamp: string,
  done: boolean,
  wip: boolean,
  removed: boolean,
): TodoCardHeaderModel | null {
  return variant === todoCardVariants.embedded
    ? null
    : {
        who,
        timestamp,
        done,
        wip,
        removed,
      };
}

export function buildTodoCardItemModel(
  input: TodoCardItemModelInput,
): TodoCardItemModel {
  return {
    node: input.node,
    depth: input.depth,
    participants: input.participants,
    agentIds: input.agentIds,
    handlers: buildTodoCardItemHandlers(input),
  };
}

export function buildTodoDraftItemModel(
  input: TodoDraftItemModelInput,
): TodoDraftItemModel {
  return {
    node: nodeFromDraft(input.draft),
    depth:
      input.draft.parentId === input.payloadId
        ? input.depth + 1
        : input.depth,
    participants: input.participants,
    agentIds: input.agentIds,
    draft: true,
    showAddSubtask: false,
    autoFocusTitle: true,
    handlers: buildTodoDraftItemHandlers(input),
  };
}

function buildTodoCardItemHandlers({
  node,
  payloadId,
  done,
  wip,
  flat,
  flatById,
  agentIds,
  setDraft,
  updateTodo,
  saveDirtyThen,
  reparent,
}: TodoCardItemModelInput): TodoItemHandlers {
  return {
    onUpdate: (patch) => updateTodo(patch),
    onToggleDone: (values) =>
      updateTodo({
        ...dirtyTodoCardValuesPatch(node, values),
        status: done ? TODO_STATUSES.open : TODO_STATUSES.done,
      }),
    onToggleWip: (values) =>
      updateTodo({
        ...dirtyTodoCardValuesPatch(node, values),
        status: wip ? TODO_STATUSES.open : TODO_STATUSES.wip,
      }),
    onRemove: async (_field, values) =>
      updateTodo({
        ...dirtyTodoCardValuesPatch(node, values),
        status: TODO_STATUSES.removed,
      }),
    onAddSubtask: (values) =>
      saveDirtyThen(values, () =>
        setDraft({
          id: generateTodoId(),
          parentId: payloadId,
          assignedTo: pickRandomAgentId(agentIds),
        }),
      ),
    onReassign: (participantId, values) =>
      updateTodo(dirtyTodoCardValuesPatch(node, values), participantId),
    onIndent: (_field, values) => {
      const parentId = nextIndentParentId(flat, payloadId);
      if (parentId === null) return;
      void reparent(values, parentId);
    },
    onOutdent: (_field, values) => {
      const parentId = nextOutdentParentId(flat, payloadId);
      if (parentId === null) return;
      void reparent(
        values,
        parentId === todoTreeSentinels.root ? null : parentId,
      );
    },
    onFocusPrev: () => focusPreviousTodo(flatById, payloadId),
    onFocusNext: () => focusNextTodo(flatById, payloadId),
    onCommitAndCreateBelow: async (values) => {
      await updateTodo(values);
      setDraft({
        id: generateTodoId(),
        parentId: node.parent_id,
        assignedTo: pickRandomAgentId(agentIds),
      });
    },
  };
}

function buildTodoDraftItemHandlers({
  draft,
  node,
  payloadId,
  agentIds,
  setDraft,
  createDraft,
}: TodoDraftItemModelInput): TodoItemHandlers {
  return {
    onUpdate: async (values) => {
      await createDraft(draft, {
        title: String(values.title ?? ""),
        body: String(values.body ?? ""),
      });
    },
    onToggleDone: (values) =>
      createDraft(draft, values, TODO_STATUSES.done).then(() => undefined),
    onToggleWip: (values) =>
      createDraft(draft, values, TODO_STATUSES.wip).then(() => undefined),
    onRemove: async () => setDraft(null),
    onAddSubtask: async (values) => {
      const created = await createDraft(draft, values);
      if (!created) return;
      setDraft({
        id: generateTodoId(),
        parentId: draft.id,
        assignedTo: pickRandomAgentId(agentIds),
      });
    },
    onReassign: async (participantId) => {
      setDraft((current) =>
        current?.id === draft.id
          ? { ...current, assignedTo: participantId ?? undefined }
          : current,
      );
    },
    onCommitAndCreateBelow: async (values) => {
      const created = await createDraft(draft, values);
      if (!created) return;
      setDraft({
        id: generateTodoId(),
        parentId: draft.parentId,
        assignedTo: pickRandomAgentId(agentIds),
      });
    },
    onIndent: () => {
      setDraft((current) =>
        current?.id === draft.id
          ? { ...current, parentId: payloadId }
          : current,
      );
    },
    onOutdent: () => {
      if (draft.parentId === undefined) return;
      setDraft((current) =>
        current?.id === draft.id
          ? { ...current, parentId: node.parent_id }
          : current,
      );
    },
    onFocusPrev: () => focusInlineTodo(payloadId),
  };
}

function focusPreviousTodo(
  flatById: Map<string, FlattenedTodo>,
  payloadId: string,
): void {
  const item = flatById.get(payloadId);
  if (item === undefined) return;
  const targetId =
    item.prevSameDepthId !== null ? item.prevSameDepthId : item.prevId;
  focusTodoTarget(targetId);
}

function focusNextTodo(
  flatById: Map<string, FlattenedTodo>,
  payloadId: string,
): void {
  const item = flatById.get(payloadId);
  if (item === undefined) return;
  const targetId =
    item.nextSameDepthId !== null ? item.nextSameDepthId : item.nextId;
  focusTodoTarget(targetId);
}

function focusTodoTarget(targetId: string | null): void {
  if (targetId !== null) focusInlineTodo(targetId);
}
