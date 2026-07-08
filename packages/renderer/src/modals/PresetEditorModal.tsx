/* PresetEditorModal — edit or create a custom preset.

   Opened by:
     - the + button in the Presets popover header (creates a new preset).
     - the pencil icon on any custom preset row (edits that preset).

   Custom presets are renderer-local (localStorage under
   `fmark:settings:custom-presets`). Built-in / project presets are
   read-only — we don't open this modal for them.

   The modal also hosts category management: clicking the pencil button
   next to the CATEGORY label replaces the seg-control with an inline
   editor for adding, renaming, deleting categories, and curating the
   emoji pool / workspace gating per category. Categories are
   renderer-local (localStorage under `fmark:settings:custom-categories`)
   and seeded once with the conventional Generate / Critique / Format
   triple so kernel-shipped built-in presets stay grouped on first open. */

import { type JSX } from "react";
import { PresetEditorView } from "./presetEditor/PresetEditorView.js";
import { usePresetEditorController } from "./presetEditor/usePresetEditorController.js";

export function PresetEditorModal(): JSX.Element {
  return <PresetEditorView controller={usePresetEditorController()} />;
}
