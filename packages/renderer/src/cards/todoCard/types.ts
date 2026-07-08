import type {
  AnyEventRecord,
  Participant,
  TodoPayload,
} from "@f-mark/shared";
import type { WhoInfo } from "../format.js";
import type {
  TodoInputField,
  TodoItemNode,
  TodoItemValues,
} from "../TodoItem.js";

export interface TodoCardProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents?: AnyEventRecord[];
  /** "embedded" drops the head chrome so the todo card slots inside an
   *  anchor ProseCard via ProseInlineBlock. */
  variant?: "standalone" | "embedded";
}

export interface InlineDraft {
  id: string;
  parentId?: string;
  assignedTo?: string;
}

export interface TodoCardContainerModel {
  className: string;
  inlineTodoId: string;
}

export interface TodoCardHeaderModel {
  who: WhoInfo;
  timestamp: string;
  done: boolean;
  wip: boolean;
  removed: boolean;
}

export interface TodoItemHandlers {
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
  onIndent?: (
    field: TodoInputField,
    values: TodoItemValues,
  ) => Promise<void> | void;
  onOutdent?: (
    field: TodoInputField,
    values: TodoItemValues,
  ) => Promise<void> | void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  onCommitAndCreateBelow?: (
    values: TodoItemValues,
  ) => Promise<void> | void;
}

export interface TodoCardItemModel {
  node: TodoItemNode;
  depth: number;
  participants: Record<string, Participant>;
  agentIds: string[];
  handlers: TodoItemHandlers;
}

export interface TodoDraftItemModel extends TodoCardItemModel {
  autoFocusTitle: true;
  draft: true;
  showAddSubtask: false;
}

export interface TodoCardModel {
  container: TodoCardContainerModel;
  header: TodoCardHeaderModel | null;
  item: TodoCardItemModel;
  draft: TodoDraftItemModel | null;
}
