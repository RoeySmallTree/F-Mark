import type { JSX } from "react";
import type { SettingsSectionKey } from "../../../state/store.js";
import type { SettingsSectionDef } from "./model.js";

interface SettingsSidebarProps {
  sections: readonly SettingsSectionDef[];
  section: SettingsSectionKey;
  onSectionChange(section: SettingsSectionKey): void;
}

export function SettingsSidebar({
  sections,
  section,
  onSectionChange,
}: SettingsSidebarProps): JSX.Element {
  return (
    <aside
      className="settings-side"
      role="tablist"
      aria-label="Settings sections"
    >
      <div className="settings-side-head">Settings</div>
      {sections.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === section}
          className={`settings-side-item${id === section ? " active" : ""}`}
          onClick={() => onSectionChange(id)}
          data-section={id}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </aside>
  );
}
