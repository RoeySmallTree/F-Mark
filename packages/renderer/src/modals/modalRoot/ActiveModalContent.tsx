import type { JSX } from "react";
import type { ModalKey } from "../../state/storeTypes.js";
import { CmdKModal } from "../CmdKModal.js";
import { HtmlPreviewModal } from "../HtmlPreviewModal.js";
import { NewSessionModal } from "../NewSessionModal.js";
import { PresetEditorModal } from "../PresetEditorModal.js";
import { SettingsModal } from "../settings/SettingsModal.js";
import { SkillEditorModal } from "../SkillEditorModal.js";
import { SkillsPaletteModal } from "../SkillsPaletteModal.js";

const NO_LOOSE_STRING_VALUES = {
  presets: "presets",
  logFilter: "log-filter",
} as const;

export function ActiveModalContent({
  activeModal,
}: {
  activeModal: Exclude<ModalKey, null>;
}): JSX.Element | null {
  switch (activeModal) {
    case "new-session":
      return <NewSessionModal />;
    case "settings":
      return <SettingsModal />;
    case "cmdk":
      return <CmdKModal />;
    case "skills":
      return <SkillsPaletteModal />;
    case "preset-editor":
      return <PresetEditorModal />;
    case "skill-editor":
      return <SkillEditorModal />;
    case "html-preview":
      return <HtmlPreviewModal />;
    case "presets":
    case "log-filter":
      return null;
  }
}

export function hasActiveModalContent(
  activeModal: Exclude<ModalKey, null>,
): boolean {
  return activeModal !== NO_LOOSE_STRING_VALUES.presets && activeModal !== NO_LOOSE_STRING_VALUES.logFilter;
}
