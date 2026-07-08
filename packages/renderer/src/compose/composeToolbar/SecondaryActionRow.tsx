import type { JSX } from "react";
import { AugmentActions } from "./AugmentActions.js";
import { SessionActions } from "./SessionActions.js";
import type { ComposeToolbarProps } from "./types.js";

type SecondaryActionRowProps = Pick<
  ComposeToolbarProps,
  | "createTodoBtnRef"
  | "forkBtnRef"
  | "mentionBtnRef"
  | "onAttachClick"
  | "onOpenCreateTodo"
  | "onOpenFork"
  | "onOpenMentions"
  | "onOpenPresets"
  | "onOpenSettings"
  | "onOpenSkills"
  | "presetsBtnRef"
  | "sessionId"
  | "settingsBtnRef"
>;

export function SecondaryActionRow(
  props: SecondaryActionRowProps,
): JSX.Element {
  return (
    <div className="compose-actions-row compose-actions-secondary">
      <AugmentActions {...props} />
      <SessionActions {...props} />
    </div>
  );
}

