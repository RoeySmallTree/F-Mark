import {
  useCallback,
  type KeyboardEventHandler,
} from "react";
import {
  folderPickerKeyAction,
  type FolderListState,
  type FolderPickerKeyAction,
} from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  none: "none",
  focus: "focus",
  pick: "pick",
} as const;

interface FolderPickerKeyboardInput {
  focusEntry(index: number): void;
  focusedIdx: number;
  load(path: string): Promise<void>;
  onPickCurrent(): void;
  state: FolderListState;
}

export function useFolderPickerKeyboard(
  input: FolderPickerKeyboardInput,
): KeyboardEventHandler<HTMLDivElement> {
  const {
    focusEntry,
    focusedIdx,
    load,
    onPickCurrent,
    state,
  } = input;

  return useCallback(
    (event): void => {
      const action = folderPickerKeyAction({
        ctrlKey: event.ctrlKey,
        focusedIdx,
        key: event.key,
        metaKey: event.metaKey,
        state,
      });
      if (action.kind === NO_LOOSE_STRING_VALUES.none) return;

      event.preventDefault();
      applyKeyAction(action, { focusEntry, load, onPickCurrent });
    },
    [focusEntry, focusedIdx, load, onPickCurrent, state],
  );
}

function applyKeyAction(
  action: Exclude<FolderPickerKeyAction, { kind: "none" }>,
  handlers: {
    focusEntry(index: number): void;
    load(path: string): Promise<void>;
    onPickCurrent(): void;
  },
): void {
  if (action.kind === NO_LOOSE_STRING_VALUES.focus) {
    handlers.focusEntry(action.focusedIdx);
    return;
  }
  if (action.kind === NO_LOOSE_STRING_VALUES.pick) {
    handlers.onPickCurrent();
    return;
  }
  void handlers.load(action.path);
}
