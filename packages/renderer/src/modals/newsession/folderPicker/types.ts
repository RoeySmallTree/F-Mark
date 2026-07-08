import type {
  Dispatch,
  KeyboardEventHandler,
  RefObject,
  SetStateAction,
} from "react";
import type { Client as ApiClient, PathFavorite } from "../../../api/client.js";
import type { FolderListState } from "./model.js";

export type FolderPickerClient = Pick<
  ApiClient,
  "addFavorite" | "fsHome" | "fsList" | "removeFavorite"
>;

export interface FolderPickerProps {
  /** Starting absolute path. If null/empty, fetches /fs/home and starts there. */
  initialPath: string | null;
  /** Called with the absolute path of the folder the user accepted. */
  onPick?(path: string): void;
  /** Cancel back to the parent UI without picking. */
  onCancel?(): void;
  /** Hide footer actions while reporting the live directory via onPathChange. */
  hideActions?: boolean;
  /** Fired whenever the shown directory changes, including the first load. */
  onPathChange?(path: string): void;
}

export interface FavoriteController {
  closeSavePrompt(): void;
  currentIsFavorited: boolean;
  favError: string | null;
  favorites: PathFavorite[];
  favName: string;
  openSavePrompt(): void;
  removeFavorite(path: string): Promise<void>;
  saveCurrentAsFavorite(name: string): Promise<void>;
  savePromptOpen: boolean;
  savingFav: boolean;
  setFavName: Dispatch<SetStateAction<string>>;
}

export interface FolderListController {
  crumbs: string[];
  focusEntry(index: number): void;
  focusedIdx: number;
  listRef: RefObject<HTMLDivElement>;
  load(path: string): Promise<void>;
  openEntry(index: number, name: string): void;
  state: FolderListState;
}

export interface FolderPickerController
  extends FavoriteController,
    FolderListController {
  hideActions: boolean;
  onCancel: (() => void) | undefined;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onPickCurrent(): void;
}
