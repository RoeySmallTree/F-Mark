/* SettingsModal — the 7-section settings dialog.
   Layout: 880px modal, 220px side-nav on the left, content pane on the right
   (min height 520px). Sections: Profile, Connected agents, Runtimes, Hooks,
   Appearance, Keyboard shortcuts, About. The active section lives in local
   state; switching between them is instant and never reaches the network
   except for `Hooks`, which fetches install status per runtime, and
   `Runtimes` when Re-probe is clicked. */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";
import {
  AtSign,
  Boxes,
  Eye,
  FileText,
  Keyboard,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { isOfferableRuntimeId, type RuntimeEntry } from "@f-mark/shared";
import { useStore, type SettingsSectionKey } from "../../state/store.js";
import { Profile } from "./Profile.js";
import { Agents } from "./Agents.js";
import { Appearance } from "./Appearance.js";
import { Shortcuts } from "./Shortcuts.js";
import { About } from "./About.js";
import { RuntimesPanel } from "./RuntimesPanel.js";
import { HookStatusPanel } from "./HookStatusPanel.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { TopBarModalContext } from "../../App.js";

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
  { id: "appearance", label: "Appearance", icon: <Eye size={14} /> },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: <Keyboard size={14} /> },
  { id: "about", label: "About", icon: <FileText size={14} /> },
];

/* The kernel ships these runtimes as builtins (see
   packages/kernel/src/runtimes/defaults.ts). The kernel `/runtimes` routes
   persist custom entries to `.f-mark/runtimes.json`; env-probe supplies the
   current PATH availability for the same ids. */
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
  opencode: {
    displayName: "Opencode",
    executable: "opencode",
    args: [],
    icon: "opencode",
    readyDelayMs: 1500,
  },
};

export function SettingsModal(): JSX.Element {
  const closeModal = useStore((s) => s.closeModal);
  const token = useStore((s) => s.token);
  const envProbe = useStore((s) => s.envProbe);
  const setEnvProbe = useStore((s) => s.setEnvProbe);
  const managedAgents = useStore((s) => s.managedAgents);
  const currentUserId = useStore((s) => s.currentUserId);
  const section = useStore((s) => s.settingsSection);
  const setSection = useStore((s) => s.setSettingsSection);

  const modalCtx = useContext(TopBarModalContext);

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const [runtimeRegistry, setRuntimeRegistry] = useState<Record<
    string,
    RuntimeEntry
  > | null>(null);

  useEffect(() => {
    let alive = true;
    void apiClient
      .listRuntimes()
      .then((cfg) => {
        if (!alive) return;
        if (
          cfg.runtimes === undefined ||
          cfg.runtimes === null ||
          typeof cfg.runtimes !== "object"
        ) {
          throw new Error("GET /runtimes returned no runtimes object");
        }
        setRuntimeRegistry(cfg.runtimes);
      })
      .catch(() => {
        if (alive) setRuntimeRegistry(null);
      });
    return () => {
      alive = false;
    };
  }, [apiClient]);

  /* Build the runtimes map from the registry plus built-ins and any IDs
     reported by env-probe. The registry is authoritative for editable fields;
     built-ins stay visible while the registry request is still loading. */
  const runtimes = useMemo<Record<string, RuntimeEntry>>(() => {
    const ids = new Set([
      ...Object.keys(BUILTIN_RUNTIME_ENTRIES),
      ...(runtimeRegistry !== null
        ? Object.keys(runtimeRegistry).filter(isOfferableRuntimeId)
        : []),
      ...(envProbe !== null
        ? Object.keys(envProbe.runtimes).filter(isOfferableRuntimeId)
        : []),
    ]);
    const out: Record<string, RuntimeEntry> = {};
    for (const id of ids) {
      out[id] =
        runtimeRegistry?.[id] ??
        BUILTIN_RUNTIME_ENTRIES[id] ??
        ({
          displayName: id,
          executable: id,
          args: [],
        } satisfies RuntimeEntry);
    }
    return out;
  }, [envProbe, runtimeRegistry]);

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

  const handleAddRuntime = useCallback(
    async (id: string, entry: RuntimeEntry) => {
      const cfg = await apiClient.upsertRuntime(id, entry);
      setRuntimeRegistry(cfg.runtimes);
      try {
        await handleReprobe();
      } catch {
        // Saving the runtime succeeded; the user can re-probe manually.
      }
    },
    [apiClient, handleReprobe],
  );

  const handleUpdateRuntime = useCallback(
    async (id: string, entry: RuntimeEntry) => {
      const cfg = await apiClient.upsertRuntime(id, entry);
      setRuntimeRegistry(cfg.runtimes);
      try {
        await handleReprobe();
      } catch {
        // Saving the runtime succeeded; the user can re-probe manually.
      }
    },
    [apiClient, handleReprobe],
  );

  const handleRemoveRuntime = useCallback(
    async (id: string) => {
      const cfg = await apiClient.removeRuntime(id);
      setRuntimeRegistry(cfg.runtimes);
      try {
        await handleReprobe();
      } catch {
        // Removing the runtime succeeded; the user can re-probe manually.
      }
    },
    [apiClient, handleReprobe],
  );

  const handleShowInstructions = useCallback(
    (runtimeId: string, participantId?: string) => {
      if (modalCtx !== null) {
        modalCtx.openHookInstall(
          runtimeId,
          runtimeId === "claude" ? undefined : participantId,
        );
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
              envProbe={envProbe}
              onReprobe={handleReprobe}
              onAdd={handleAddRuntime}
              onUpdate={handleUpdateRuntime}
              onRemove={handleRemoveRuntime}
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
          {section === "appearance" ? <Appearance /> : null}
          {section === "shortcuts" ? <Shortcuts /> : null}
          {section === "about" ? <About /> : null}
        </main>
      </div>
    </div>
  );
}
