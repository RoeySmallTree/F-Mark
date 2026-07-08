import type {
  FsListEntry,
  FsListResponse,
} from "../../../api/client.js";

const NO_LOOSE_STRING_VALUES = {
  ready: "ready",
  error: "error",
  focus: "focus",
  pick: "pick",
  open: "open",
  parent: "parent",
} as const;

export interface FolderListState {
  status: "loading" | "ready" | "error";
  path: string;
  parent: string | null;
  entries: FsListEntry[];
  error: string | null;
  truncated: boolean;
}

export const LOADING_LIST_STATE: FolderListState = {
  status: "loading",
  path: "",
  parent: null,
  entries: [],
  error: null,
  truncated: false,
};

export function splitBreadcrumbs(absPath: string): string[] {
  if (absPath === "/" || absPath === "") return [];
  return absPath.split("/").filter((segment) => segment.length > 0);
}

export function joinAt(crumbs: string[], idx: number): string {
  if (idx < 0) return "/";
  return "/" + crumbs.slice(0, idx + 1).join("/");
}

export function childPath(parentPath: string, childName: string): string {
  return `${parentPath === "/" ? "" : parentPath}/${childName}`;
}

export function firstEntryIndex(entries: FsListEntry[]): number {
  return entries.length > 0 ? 0 : -1;
}

export function listStateFromResponse(data: FsListResponse): FolderListState {
  return {
    status: NO_LOOSE_STRING_VALUES.ready,
    path: data.path,
    parent: data.parent,
    entries: data.entries,
    error: null,
    truncated: data.truncated,
  };
}

export function listStateFromError(
  target: string,
  error: unknown,
): FolderListState {
  return {
    status: NO_LOOSE_STRING_VALUES.error,
    path: target,
    parent: null,
    entries: [],
    error: error instanceof Error ? error.message : String(error),
    truncated: false,
  };
}

export type FolderPickerKeyAction =
  | { kind: "none" }
  | { kind: "focus"; focusedIdx: number }
  | { kind: "open"; path: string }
  | { kind: "parent"; path: string }
  | { kind: "pick" };

interface FolderPickerKeyInput {
  ctrlKey: boolean;
  focusedIdx: number;
  key: string;
  metaKey: boolean;
  state: FolderListState;
}

const NO_KEY_ACTION: FolderPickerKeyAction = { kind: "none" };

export function folderPickerKeyAction(
  input: FolderPickerKeyInput,
): FolderPickerKeyAction {
  if (input.state.status !== NO_LOOSE_STRING_VALUES.ready) return NO_KEY_ACTION;

  switch (input.key) {
    case "ArrowDown":
      return {
        kind: NO_LOOSE_STRING_VALUES.focus,
        focusedIdx: Math.min(
          input.state.entries.length - 1,
          input.focusedIdx + 1,
        ),
      };
    case "ArrowUp":
      return {
        kind: NO_LOOSE_STRING_VALUES.focus,
        focusedIdx: Math.max(0, input.focusedIdx - 1),
      };
    case "Enter":
      return enterKeyAction(input);
    case "Backspace":
      return parentKeyAction(input.state);
    default:
      return NO_KEY_ACTION;
  }
}

function enterKeyAction(input: FolderPickerKeyInput): FolderPickerKeyAction {
  if (input.metaKey || input.ctrlKey) return { kind: NO_LOOSE_STRING_VALUES.pick };

  const path = focusedEntryPath(input.state, input.focusedIdx);
  return path === null ? NO_KEY_ACTION : { kind: NO_LOOSE_STRING_VALUES.open, path };
}

function parentKeyAction(state: FolderListState): FolderPickerKeyAction {
  return state.parent === null
    ? NO_KEY_ACTION
    : { kind: NO_LOOSE_STRING_VALUES.parent, path: state.parent };
}

function focusedEntryPath(
  state: FolderListState,
  focusedIdx: number,
): string | null {
  const entry = state.entries[focusedIdx];
  return entry === undefined ? null : childPath(state.path, entry.name);
}
