/* SettingsModal - stable public entrypoint for the settings dialog. */

import type { JSX } from "react";
import { SettingsModalView } from "./settingsModal/SettingsModalView.js";
import { useSettingsModalController } from "./settingsModal/useSettingsModalController.js";

export function SettingsModal(): JSX.Element {
  return <SettingsModalView controller={useSettingsModalController()} />;
}
