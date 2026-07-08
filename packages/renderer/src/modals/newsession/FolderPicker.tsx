/* FolderPicker — kernel-served folder navigator used by NewSessionModal.
   Rendered inline inside the parent modal (no second backdrop) when the
   user clicks "Browse…". Calls /fs/list to enumerate subdirectories of
   the currently-shown path; arrow keys move selection, Enter descends,
   "Use this folder" returns the *currently-shown* directory to the parent
   via onPick. */

import { type JSX } from "react";
import { FolderPickerView } from "./folderPicker/FolderPickerView.js";
import type { FolderPickerProps } from "./folderPicker/types.js";
import { useFolderPickerController } from "./folderPicker/useFolderPickerController.js";

export type { FolderPickerProps } from "./folderPicker/types.js";

export function FolderPicker(props: FolderPickerProps): JSX.Element {
  return <FolderPickerView controller={useFolderPickerController(props)} />;
}
