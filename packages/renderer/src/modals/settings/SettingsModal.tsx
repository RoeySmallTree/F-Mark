/* SettingsModal — the 8-section settings dialog.
   Layout: 880px modal, 220px side-nav on the left, content pane on the right
   (min height 520px). Sections: Profile, Connected agents, Runtimes, Hooks,
   Env probe, Appearance, Keyboard shortcuts, About. The active section
   lives in local state; switching between them is instant and never
   reaches the network (except for `Hooks`, which fetches install status
   per runtime, and `Env probe` when Re-probe is clicked). */

import { useCallback, useContext, useMemo, useState, type JSX } from "react";
import {
  AtSign,
  Boxes,
  Eye,
  FileText,
  Keyboard,
  Radar,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import type { RuntimeEntry } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { Profile } from "./Profile.js";
import { Agents } from "./Agents.js";
import { Appearance } from "./Appearance.js";
import { Shortcuts } from "./Shortcuts.js";
import { About } from "./About.js";
import { RuntimesPanel } from "./RuntimesPanel.js";
import { HookStatusPanel } from "./HookStatusPanel.js";
import { EnvProbePanel } from "./EnvProbePanel.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { TopBarModalContext } from "../../App.js";

export type SettingsSectionKey =
  | "profile"
  | "agents"
  | "runtimes"
  | "hooks"
  | "env-probe"
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
  { id: "runtimes", label: "Runtimes", icon: <Boxes size={14} /> },
  { id: "hooks", label: "Hooks", icon: <ShieldCheck size={14} /> },
  { id: "env-probe", label: "Env probe", icon: <Radar size={14} /> },
  { id: "appearance", label: "Appearance", icon: <Eye size={14} /> },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard size={14} /> },
  { id: "about", label: "About", icon: <FileText size={14} /> },
];

/* The kernel ships these three runtimes as builtins (see
   packages/kernel/src/runtimes/defaults.ts). For v0.4 we use the same map
   the TopBar uses (KNOWN_RUNTIMES) to surface display names + executables
   for the panels — until the kernel exposes `/runtimes` HTTP routes the
   renderer can't enumerate user-edited entries from `.f-mark/runtimes.json`. */
const BUILTIN_RUNTIME_ENTRIES: Record<string, RuntimeEntry> = {
  claude: {
    displayName: "Claude Code",
    executable: "claude",
    args: [],
    icon: "claude",
    readyDelayMs: 2000,
  },
  codex: {
    displayName: "Codex",
    executable: "codex",
    args: [],
    icon: "codex",
    readyDelayMs: 1500,
  },
  gemini: {
    displayName: "Gemini",
    executable: "gemini",
    args: [],
    icon: "gemini",
    readyDelayMs: 1500,
  },
};

const READ_ONLY_NOTE =
  "v0.4: the kernel does not yet expose /runtimes CRUD endpoints. Edit .f-mark/runtimes.json directly to add or change custom runtimes; restart the kernel to pick up the change.";

export function SettingsModal(): JSX.Element {
  const closeModal = useStore((s) => s.closeModal);
  const token = useStore((s) => s.token);
  const envProbe = useStore((s) => s.envProbe);
  const setEnvProbe = useStore((s) => s.setEnvProbe);
  const managedAgents = useStore((s) => s.managedAgents);
  const currentUserId = useStore((s) => s.currentUserId);
  const [section, setSection] = useState<SettingsSectionKey>("profile");

  const modalCtx = useContext(TopBarModalContext);

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );

  /* Build the runtimes map. envProbe.runtimes is the authoritative set of
     registered runtime ids; we hydrate each from BUILTIN_RUNTIME_ENTRIES and
     fall back to a minimal stub for unknown ids. */
  const runtimes = useMemo<Record<string, RuntimeEntry>>(() => {
    const ids =
      envProbe !== null
        ? Object.keys(envProbe.runtimes)
        : Object.keys(BUILTIN_RUNTIME_ENTRIES);
    const out: Record<string, RuntimeEntry> = {};
    for (const id of ids) {
      out[id] =
        BUILTIN_RUNTIME_ENTRIES[id] ??
        ({
          displayName: id,
          executable: id,
          args: [],
        } satisfies RuntimeEntry);
    }
    return out;
  }, [envProbe]);

  /* For Hooks: pick a representative managed-agent participant per runtime so
     we can call /hook-install-status without making the user choose one. */
  const participantIdForRuntime = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const ma of managedAgents) {
      if (ma.runtime_id !== null && !(ma.runtime_id in out)) {
        out[ma.runtime_id] = ma.participant_id;
      }
    }
    return out;
  }, [managedAgents]);

  const handleReprobe = useCallback(async () => {
    const r = await apiClient.refreshEnvProbe();
    setEnvProbe(r);
  }, [apiClient, setEnvProbe]);

  const noopRuntimeMutation = useCallback(async () => {
    /* v0.4: no /runtimes HTTP routes — see READ_ONLY_NOTE. */
  }, []);

  const handleShowInstructions = useCallback(
    (runtimeId: string, participantId: string) => {
      if (modalCtx !== null) {
        modalCtx.openHookInstall(runtimeId, participantId);
      }
    },
    [modalCtx],
  );

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
          {section === "runtimes" ? (
            <RuntimesPanel
              runtimes={runtimes}
              onAdd={noopRuntimeMutation}
              onUpdate={noopRuntimeMutation}
              onRemove={noopRuntimeMutation}
              readOnlyNote={READ_ONLY_NOTE}
            />
          ) : null}
          {section === "hooks" ? (
            <HookStatusPanel
              runtimes={runtimes}
              participantIdForRuntime={participantIdForRuntime}
              userParticipantId={currentUserId}
              apiClient={apiClient}
              onShowInstructions={handleShowInstructions}
            />
          ) : null}
          {section === "env-probe" ? (
            <EnvProbePanel envProbe={envProbe} onReprobe={handleReprobe} />
          ) : null}
          {section === "appearance" ? <Appearance /> : null}
          {section === "shortcuts" ? <Shortcuts /> : null}
          {section === "about" ? <About /> : null}
        </main>
      </div>
    </div>
  );
}
