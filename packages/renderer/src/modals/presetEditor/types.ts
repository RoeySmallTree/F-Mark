import type {
  Dispatch,
  KeyboardEvent,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { CustomCategory } from "../../popovers/customCategories.js";

export interface PresetEditorController {
  isNew: boolean;
  categories: CustomCategory[];
  name: string;
  group: string;
  icon: string;
  body: string;
  workspaces: string[];
  emojiOpen: boolean;
  confirmingDelete: boolean;
  managingCategories: boolean;
  categoryEmojis: string[];
  canSave: boolean;
  nameRef: MutableRefObject<HTMLInputElement | null>;
  closeModal(): void;
  onSave(): void;
  onDelete(): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  toggleWorkspace(path: string): void;
  bumpCustomCategories(): void;
  setName: Dispatch<SetStateAction<string>>;
  setGroup: Dispatch<SetStateAction<string>>;
  setIcon: Dispatch<SetStateAction<string>>;
  setBody: Dispatch<SetStateAction<string>>;
  setEmojiOpen: Dispatch<SetStateAction<boolean>>;
  setConfirmingDelete: Dispatch<SetStateAction<boolean>>;
  setManagingCategories: Dispatch<SetStateAction<boolean>>;
}
