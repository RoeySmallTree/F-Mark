import type { JSX } from "react";
import { GitFork, Settings2 } from "lucide-react";
import { ToolbarIconButton } from "./ToolbarIconButton.js";
import type { ComposeToolbarProps } from "./types.js";

type SessionActionsProps = Pick<
  ComposeToolbarProps,
  | "forkBtnRef"
  | "onOpenFork"
  | "onOpenSettings"
  | "sessionId"
  | "settingsBtnRef"
>;

export function SessionActions({
  forkBtnRef,
  onOpenFork,
  onOpenSettings,
  sessionId,
  settingsBtnRef,
}: SessionActionsProps): JSX.Element {
  return (
    <div className="compose-zone compose-zone-end">
      <ToolbarIconButton
        refObject={forkBtnRef}
        onClick={onOpenFork}
        ariaLabel="Fork current session"
        title="Fork session"
        disabled={sessionId === null}
        label="Fork"
      >
        <GitFork size={14} aria-hidden />
      </ToolbarIconButton>
      <ToolbarIconButton
        refObject={settingsBtnRef}
        onClick={onOpenSettings}
        ariaLabel="Compose settings"
        title="Compose settings"
      >
        <Settings2 size={14} aria-hidden />
      </ToolbarIconButton>
    </div>
  );
}

