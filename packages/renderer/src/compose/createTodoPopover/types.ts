import type {
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";
import type { TodoTreeNode } from "@f-mark/shared";
import type { TodoDropdownOption } from "../../panels/todoPanelUtils.js";

export interface CreateTodoPopoverProps {
  anchorRect: DOMRect | null;
  onClose(): void;
  endTurnAfter: boolean;
  onCreated(): Promise<void>;
}

export interface ParticipantOption {
  id: string;
  label: string;
}

export interface CreateTodoFields {
  titleRef: RefObject<HTMLInputElement>;
  descriptionRef: RefObject<HTMLInputElement>;
  title: string;
  setTitle(value: string): void;
  description: string;
  setDescription(value: string): void;
  parentId: string;
  setParentId(value: string): void;
}

export interface CreateTodoAssigneeState {
  assignedTo: string;
  setAssignedTo(value: string): void;
  participantOptions: ParticipantOption[];
  sessionAgentIds: string[];
  assignedToCurrentSessionAgent: boolean;
}

export interface TodoRootsState {
  roots: TodoTreeNode[];
  loadingTodos: boolean;
  loadError: string | null;
}

export interface CreateTodoActions {
  submitError: string | null;
  busy: boolean;
  canCreate: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTitleKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onDescriptionKeyDown: KeyboardEventHandler<HTMLInputElement>;
}

export interface CreateTodoPopoverController
  extends CreateTodoFields,
    CreateTodoActions {
  assignedTo: string;
  setAssignedTo(value: string): void;
  parentOptions: TodoDropdownOption[];
  participantOptions: ParticipantOption[];
  loadingTodos: boolean;
  loadError: string | null;
}
