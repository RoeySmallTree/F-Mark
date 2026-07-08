import type { JSX } from "react";
import { Bot, ListChecks, Paperclip, Sparkles, Zap } from "lucide-react";
import { PRESETS_SHORTCUT, SKILLS_SHORTCUT } from "../composeHelpers.js";
import { ToolbarIconButton } from "./ToolbarIconButton.js";
import type { ComposeToolbarProps } from "./types.js";

type AugmentActionsProps = Pick<
  ComposeToolbarProps,
  | "createTodoBtnRef"
  | "mentionBtnRef"
  | "onAttachClick"
  | "onOpenCreateTodo"
  | "onOpenMentions"
  | "onOpenPresets"
  | "onOpenSkills"
  | "presetsBtnRef"
  | "sessionId"
>;

export function AugmentActions({
  createTodoBtnRef,
  mentionBtnRef,
  onAttachClick,
  onOpenCreateTodo,
  onOpenMentions,
  onOpenPresets,
  onOpenSkills,
  presetsBtnRef,
  sessionId,
}: AugmentActionsProps): JSX.Element {
  return (
    <div className="compose-zone compose-zone-augments">
      <ToolbarIconButton
        refObject={mentionBtnRef}
        onClick={onOpenMentions}
        ariaLabel="Mention agent"
        title="Mention agent"
        label="Agent"
      >
        <Bot size={14} aria-hidden />
      </ToolbarIconButton>
      <ToolbarIconButton
        refObject={presetsBtnRef}
        onClick={onOpenPresets}
        ariaLabel="Open presets"
        title={`Open presets (${PRESETS_SHORTCUT})`}
        label="Presets"
      >
        <Zap size={14} aria-hidden />
      </ToolbarIconButton>
      <ToolbarIconButton
        onClick={onOpenSkills}
        ariaLabel="Open skills palette"
        title={`Open skills palette (${SKILLS_SHORTCUT})`}
        label="Skills"
      >
        <Sparkles size={14} aria-hidden />
      </ToolbarIconButton>
      <ToolbarIconButton
        refObject={createTodoBtnRef}
        onClick={onOpenCreateTodo}
        ariaLabel="Open create todo"
        title="Create Todo"
        label="Task"
      >
        <ListChecks size={14} aria-hidden />
      </ToolbarIconButton>
      <ToolbarIconButton
        onClick={onAttachClick}
        ariaLabel="Attach a file"
        title="Attach a file"
        disabled={sessionId === null}
        label="Attach"
      >
        <Paperclip size={14} aria-hidden />
      </ToolbarIconButton>
    </div>
  );
}

