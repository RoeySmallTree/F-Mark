/* SettingsModal — the 5-section settings dialog.
   Layout: 880px modal, 220px side-nav on the left, content pane on the right
   (min height 520px). Five sections: Profile, Connected Agents, Appearance,
   Shortcuts, About. The active section lives in local state; switching
   between them is instant and never reaches the network. */

import { useState, type JSX } from "react";
import {
  AtSign,
  Eye,
  FileText,
  Keyboard,
  X,
  Zap,
} from "lucide-react";
import { useStore } from "../../state/store.js";
import { Profile } from "./Profile.js";
import { Agents } from "./Agents.js";
import { Appearance } from "./Appearance.js";
import { Shortcuts } from "./Shortcuts.js";
import { About } from "./About.js";

export type SettingsSectionKey =
  | "profile"
  | "agents"
  | "appearance"
  | "shortcuts"
  | "about";

interface SectionDef {
  id: SettingsSectionKey;
  label: string;
  icon: JSX.Element;
}

const SECTIONS: SectionDef[] = [
  { id: "profile", label: "Profile", icon: <AtSign size={14} /> },
  { id: "agents", label: "Connected agents", icon: <Zap size={14} /> },
  { id: "appearance", label: "Appearance", icon: <Eye size={14} /> },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard size={14} /> },
  { id: "about", label: "About", icon: <FileText size={14} /> },
];

export function SettingsModal(): JSX.Element {
  const closeModal = useStore((s) => s.closeModal);
  const [section, setSection] = useState<SettingsSectionKey>("profile");

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
        <aside
          className="settings-side"
          role="tablist"
          aria-label="Settings sections"
        >
          <div className="settings-side-head">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === section}
              className={`settings-side-item${s.id === section ? " active" : ""}`}
              onClick={() => setSection(s.id)}
              data-section={s.id}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </aside>
        <main className="settings-main">
          <button
            type="button"
            className="icon-btn modal-close"
            onClick={closeModal}
            aria-label="Close settings"
          >
            <X size={14} aria-hidden="true" />
          </button>

          {section === "profile" ? <Profile /> : null}
          {section === "agents" ? <Agents /> : null}
          {section === "appearance" ? <Appearance /> : null}
          {section === "shortcuts" ? <Shortcuts /> : null}
          {section === "about" ? <About /> : null}
        </main>
      </div>
    </div>
  );
}
