import { isOfferableRuntimeId } from "@f-mark/shared";
import { useMemo } from "react";
import {
  Columns,
  FileText,
  MessageSquare,
  Search,
  Settings,
} from "lucide-react";
import { useStore } from "../state/store.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import { EnvProbeBanner } from "../components/EnvProbeBanner.js";
import { copyToClipboard } from "../render/copy.js";
import { KNOWN_RUNTIMES } from "../runtimes.js";
import { PathSwitcher } from "./PathSwitcher.js";
import { ASCII_LOGO } from "../branding.js";

const COMMAND_PALETTE_SHORTCUT = chordToLabel("$mod+K");

export function TopBar(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const openModal = useStore((s) => s.openModal);
  const openSettings = useStore((s) => s.openSettings);
  const envProbe = useStore((s) => s.envProbe);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  const probeRuntimes = useMemo<Record<string, boolean> | null>(() => {
    if (envProbe === null) return null;
    const r = (envProbe as { runtimes?: Record<string, boolean> }).runtimes;
    if (r === undefined || r === null) return null;
    return r;
  }, [envProbe]);

  const registeredRuntimes = useMemo(() => {
    const ids = new Set([
      ...Object.keys(KNOWN_RUNTIMES),
      ...(probeRuntimes !== null
        ? Object.keys(probeRuntimes).filter(isOfferableRuntimeId)
        : []),
    ]);
    const out: Record<string, { displayName: string; executable: string }> = {};
    for (const id of ids) {
      out[id] = KNOWN_RUNTIMES[id] ?? { displayName: id, executable: id };
    }
    return out;
  }, [probeRuntimes]);

  return (
    <div className="topbar-wrap">
      <EnvProbeBanner
        envProbe={envProbe}
        registeredRuntimes={registeredRuntimes}
        onCopyInstall={(cmd) => {
          void copyToClipboard(cmd);
        }}
      />
      <div className="topbar" role="banner">
        <div className="brand" title="F-Mark">
          <span className="logo-mark" aria-hidden="true">
            <pre className="glyph">{ASCII_LOGO}</pre>
          </span>
          <span className="name">F·Mark</span>
        </div>
        <div className="breadcrumb" role="presentation">
          <PathSwitcher />
          <span className="sep">/</span>
          <span className="sess">{currentSession?.slug ?? "no session"}</span>
        </div>

        <div className="topbar-center">
          <div
            className="view-toggle"
            role="tablist"
            aria-label="Feed view mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "everything"}
              className={viewMode === "everything" ? "active" : ""}
              onClick={() => setViewMode("everything")}
              title="Show every event"
            >
              <Columns size={12} aria-hidden="true" /> Everything
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "document"}
              className={viewMode === "document" ? "active" : ""}
              onClick={() => setViewMode("document")}
              title="Show only named prose"
            >
              <FileText size={12} aria-hidden="true" /> Document
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "conversation"}
              className={viewMode === "conversation" ? "active" : ""}
              onClick={() => setViewMode("conversation")}
              title="Show only messages and turns"
            >
              <MessageSquare size={12} aria-hidden="true" /> Conversation
            </button>
          </div>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="icon-btn"
            title={`Search (${COMMAND_PALETTE_SHORTCUT})`}
            aria-label="Open command palette"
            onClick={() => openModal("cmdk")}
          >
            <Search size={15} aria-hidden="true" />
            <span className="kbd">{COMMAND_PALETTE_SHORTCUT}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Settings"
            aria-label="Open settings"
            onClick={() => openSettings("profile")}
          >
            <Settings size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
