import type { JSX } from "react";
import { About } from "../About.js";
import { Agents } from "../Agents.js";
import { Appearance } from "../Appearance.js";
import { GitDiffPanel } from "../GitDiffPanel.js";
import { Profile } from "../Profile.js";
import { RuntimesPanel } from "../RuntimesPanel.js";
import { Shortcuts } from "../Shortcuts.js";
import type { SettingsModalController } from "./useSettingsModalController.js";

interface SettingsTabPanelProps {
  controller: SettingsModalController;
}

export function SettingsTabPanel({
  controller,
}: SettingsTabPanelProps): JSX.Element | null {
  switch (controller.section) {
    case "profile":
      return <Profile />;
    case "agents":
      return <Agents />;
    case "runtimes":
      return (
        <RuntimesPanel
          runtimes={controller.runtimes}
          envProbe={controller.envProbe}
          onReprobe={controller.handleReprobe}
          onAdd={controller.handleAddRuntime}
          onUpdate={controller.handleUpdateRuntime}
          onRemove={controller.handleRemoveRuntime}
        />
      );
    case "appearance":
      return <Appearance />;
    case "git-diff":
      return <GitDiffPanel />;
    case "shortcuts":
      return <Shortcuts />;
    case "about":
      return <About />;
  }
  return null;
}
