import type { JSX } from "react";
import { X } from "lucide-react";
import { SettingsSidebar } from "./SettingsSidebar.js";
import { SettingsTabPanel } from "./SettingsTabPanel.js";
import type { SettingsModalController } from "./useSettingsModalController.js";

interface SettingsModalViewProps {
  controller: SettingsModalController;
}

/* Focus trap: this dialog renders inside ModalBackdrop, which applies
   useFocusTrap to the shared container — see src/a11y/useFocusTrap.ts. */
export function SettingsModalView({
  controller,
}: SettingsModalViewProps): JSX.Element {
  return (
    <div
      className="modal"
      style={{ width: 880 }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="settings">
        <SettingsSidebar
          sections={controller.sections}
          section={controller.section}
          onSectionChange={controller.setSection}
        />
        <main className="settings-main">
          <button
            type="button"
            className="icon-btn modal-close"
            onClick={controller.closeModal}
            aria-label="Close settings"
          >
            <X size={14} aria-hidden="true" />
          </button>

          <SettingsTabPanel controller={controller} />
        </main>
      </div>
    </div>
  );
}
