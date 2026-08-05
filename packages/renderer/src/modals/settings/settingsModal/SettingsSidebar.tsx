import { useRef, type JSX } from "react";
import { useRovingTabIndex } from "../../../a11y/useRovingTabIndex.js";
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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    sections.findIndex((s) => s.id === section),
    0,
  );
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    sections.length,
    activeIndex,
    (index) => {
      const next = sections[index];
      if (next === undefined) return;
      onSectionChange(next.id);
      itemRefs.current[index]?.focus();
    },
  );

  return (
    <aside
      className="settings-side"
      role="tablist"
      aria-label="Settings sections"
      onKeyDown={onKeyDown}
    >
      <div className="settings-side-head">Settings</div>
      {sections.map(({ id, label, Icon }, index) => (
        <button
          key={id}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role="tab"
          aria-selected={id === section}
          tabIndex={tabIndexFor(index)}
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
