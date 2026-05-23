import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Columns,
  FileText,
  MessageSquare,
  Search,
  Settings,
} from "lucide-react";
import { useStore } from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";
import { AgentChip } from "../components/AgentChip.js";
import { TerminalChip } from "../components/TerminalChip.js";
import {
  PlusButton,
  type PlusButtonRuntime,
} from "../components/PlusButton.js";
import { AgentActionMenu } from "../components/AgentActionMenu.js";
import { EnvProbeBanner } from "../components/EnvProbeBanner.js";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { copyToClipboard } from "../render/copy.js";
import { TopBarModalContext } from "../App.js";
import type { PresenceState, SpawnResponse } from "@f-mark/shared";

export const FMARK_GLYPH = `▟▙ ╱╲
▟▙ ▟▘▘`;

const COMMAND_PALETTE_SHORTCUT = chordToLabel("$mod+K");

/* For v0.4 we use the built-in runtime catalog: kernel ships claude / codex /
   gemini by default and has no /runtimes endpoint to enumerate user-edited
   entries. We treat env-probe.runtimes (which the kernel populates by
   walking the registered runtime list) as the authoritative set of IDs and
   fall back to this lookup for display names. */
const KNOWN_RUNTIMES: Record<string, { displayName: string; executable: string }> = {
  claude: { displayName: "Claude Code", executable: "claude" },
  codex: { displayName: "Codex", executable: "codex" },
  gemini: { displayName: "Gemini", executable: "gemini" },
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (
    (parts[0]![0] ?? "").toUpperCase() + (parts[1]![0] ?? "").toUpperCase()
  );
}

export function TopBar(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const openModal = useStore((s) => s.openModal);
  const token = useStore((s) => s.token);
  const managedAgents = useStore((s) => s.managedAgents);
  const managedTerminals = useStore((s) => s.managedTerminals);
  const presence = useStore((s) => s.presence);
  const envProbe = useStore((s) => s.envProbe);
  const addManagedAgent = useStore((s) => s.addManagedAgent);
  const addManagedTerminal = useStore((s) => s.addManagedTerminal);
  const modalCtx = useContext(TopBarModalContext);

  /* Local UI: which AgentChip's action menu is open (anchored to that
     chip). null means "no menu open". */
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId) ?? null,
    [sessions, currentSessionId],
  );

  const agg = useMemo(() => aggregate(events), [events]);
  const turn = agg.currentTurnParticipantPrefix;

  /* Gate "Agent thinking…" on at least one agent being present (online or
     stale per the presence map). Without this gate, after an agent
     disconnects but never emits a closing turn-end, the pill keeps
     reporting that an agent is mid-turn — which the user sees as a
     stale "Agent thinking…" with no agent attached. */
  const anyAgentActive = useMemo(() => {
    return Object.values(presence).some(
      (p) => p.state === "online" || p.state === "stale",
    );
  }, [presence]);

  const effectiveTurn: "us" | "ag" | "idle" =
    turn === "ag" && !anyAgentActive ? "idle" : turn;

  const turnPillClass =
    effectiveTurn === "us"
      ? "turn-pill"
      : effectiveTurn === "ag"
        ? "turn-pill thinking"
        : "turn-pill idle";
  const turnLabel =
    effectiveTurn === "us"
      ? "Your turn"
      : effectiveTurn === "ag"
        ? "Agent thinking…"
        : "Idle";

  const sortedParticipants = useMemo(() => {
    return Object.entries(participants)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => {
        if (a.kind === b.kind) return a.id.localeCompare(b.id);
        return a.kind === "user" ? -1 : 1;
      });
  }, [participants]);

  /* Build the PlusButton runtime list from envProbe.runtimes (authoritative
     set of registered IDs from the kernel) joined with KNOWN_RUNTIMES for
     displayNames. If envProbe is null OR malformed (no runtimes field, as
     happens in dev/tests before the endpoint responds) we fall back to the
     built-in defaults so the button still works on first load. */
  const probeRuntimes = useMemo<Record<string, boolean> | null>(() => {
    if (envProbe === null) return null;
    const r = (envProbe as { runtimes?: Record<string, boolean> }).runtimes;
    if (r === undefined || r === null) return null;
    return r;
  }, [envProbe]);

  const runtimes = useMemo<PlusButtonRuntime[]>(() => {
    const ids =
      probeRuntimes !== null
        ? Object.keys(probeRuntimes)
        : Object.keys(KNOWN_RUNTIMES);
    return ids.map((id) => ({
      id,
      displayName: KNOWN_RUNTIMES[id]?.displayName ?? id,
      available: probeRuntimes !== null ? probeRuntimes[id] === true : true,
    }));
  }, [probeRuntimes]);

  const registeredRuntimes = useMemo(() => {
    const ids =
      probeRuntimes !== null
        ? Object.keys(probeRuntimes)
        : Object.keys(KNOWN_RUNTIMES);
    const out: Record<string, { displayName: string; executable: string }> = {};
    for (const id of ids) {
      out[id] = KNOWN_RUNTIMES[id] ?? { displayName: id, executable: id };
    }
    return out;
  }, [probeRuntimes]);

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );

  /* After a successful spawn we may need to open the hook-install modal.
     The check is hooks_status !== "installed" per the contract: kernel
     marks the agent as having installed hooks when it sees them. */
  const onSpawnComplete = useCallback(
    (resp: SpawnResponse) => {
      /* Add the spawned agent to local chip state immediately so the user
         sees the chip without waiting for the WS managed-agent.spawned
         round-trip. The WS handler dedupes on participant_id, so even if
         both fire, only one entry persists. */
      addManagedAgent({
        participant_id: resp.participant_id,
        tmux_session: resp.tmux_session,
        runtime_id: resp.runtime_id,
      });
      if (resp.hooks_status !== "installed" && modalCtx !== null) {
        modalCtx.openHookInstall(resp.runtime_id, resp.participant_id);
      }
    },
    [addManagedAgent, modalCtx],
  );

  const onSpawnRuntime = useCallback(
    (runtimeId: string) => {
      void apiClient
        .spawn({
          runtime_id: runtimeId,
          session_id: currentSessionId ?? undefined,
        })
        .then(onSpawnComplete)
        .catch((e: unknown) => {
          /* Surface failure via console; visual surfaces (toast, etc.)
             are a follow-up. */
          // eslint-disable-next-line no-console
          console.error("spawn failed", e);
        });
    },
    [apiClient, currentSessionId, onSpawnComplete],
  );

  const onSpawnTerminal = useCallback(() => {
    void apiClient
      .spawnTerminal()
      .then((resp) => {
        /* Symmetric to onSpawnComplete: add the spawned terminal to local
           chip state immediately. */
        addManagedTerminal({
          tmux_session: resp.tmux_session,
          label: resp.label,
        });
      })
      .catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error("spawn terminal failed", e);
      });
  }, [apiClient, addManagedTerminal]);

  const onManageRuntimes = useCallback(() => {
    openModal("settings");
  }, [openModal]);

  const tmuxMissing = envProbe !== null && envProbe.tmux === false;

  /* Build a single chip list sourced from participants (every agent who has
     ever appeared in the session) joined with managedAgents (for tmux info
     and runtime_id). Un-managed agents — those present in the participants
     slice but not in managedAgents — still get a full AgentChip with name,
     presence dot, and click → AgentActionMenu, so a pre-existing agent
     from a prior session is never an orphaned bare avatar. */
  const allAgentChips = useMemo(() => {
    const managedById = new Map<string, (typeof managedAgents)[number]>();
    for (const a of managedAgents) {
      managedById.set(a.participant_id, a);
    }
    const entries = Object.entries(participants)
      .filter(([, p]) => p.kind === "agent")
      .map(([id, p]) => {
        const managed = managedById.get(id);
        return {
          participant_id: id,
          name: p.name,
          runtime_id: managed?.runtime_id ?? null,
          tmux_session: managed?.tmux_session ?? null,
          isManaged: managed !== undefined,
        };
      });
    /* Sort by presence state — online first, then stale/launching, then
       hook-not-installed, then pane-dead, then offline/unknown — and
       alphabetically by name within each bucket. */
    const order = (id: string): number => {
      const s = presence[id]?.state;
      if (s === "online") return 0;
      if (s === "stale" || s === "launching") return 1;
      if (s === "hook-not-installed") return 2;
      if (s === "pane-dead") return 3;
      return 4;
    };
    return entries.sort((a, b) => {
      const oa = order(a.participant_id);
      const ob = order(b.participant_id);
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });
  }, [participants, managedAgents, presence]);

  const sortedTerminals = useMemo(
    () =>
      [...managedTerminals].sort((a, b) =>
        a.tmux_session.localeCompare(b.tmux_session),
      ),
    [managedTerminals],
  );

  /* Close the agent action menu on outside-click or Escape. The menu
     itself is anchored to the chip; clicking inside the menu shouldn't
     dismiss. */
  useEffect(() => {
    if (openMenuFor === null) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest(".agent-action-menu")) return;
      if (e.target.closest(".agent-chip")) return;
      setOpenMenuFor(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpenMenuFor(null);
    }
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocMouseDown);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenuFor]);

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
          <pre className="glyph" aria-hidden="true">
            {FMARK_GLYPH}
          </pre>
          <span className="name">F·Mark</span>
        </div>
        <div className="breadcrumb" role="presentation">
          <span className="proj">f-mark</span>
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
          <div
            className={turnPillClass}
            role="status"
            aria-live="polite"
            title={turnLabel}
          >
            <span className="dot" aria-hidden="true" />
            {turnLabel}
          </div>

          {/* Chip strip — managed agents, managed terminals, and the + button.
              Wrapped so the action menu can position itself relative to its
              chip via CSS. */}
          <div className="topbar-chips">
            {allAgentChips.map((agent) => {
              const state: PresenceState =
                presence[agent.participant_id]?.state ?? "offline";
              return (
                <div key={agent.participant_id} className="agent-chip-anchor">
                  <AgentChip
                    participantId={agent.participant_id}
                    name={agent.name}
                    runtimeId={agent.runtime_id}
                    state={state}
                    onClick={() =>
                      setOpenMenuFor((cur) =>
                        cur === agent.participant_id
                          ? null
                          : agent.participant_id,
                      )
                    }
                  />
                  {openMenuFor === agent.participant_id ? (
                    <div className="agent-action-menu-popover">
                      <AgentActionMenu
                        participantId={agent.participant_id}
                        name={agent.name}
                        state={state}
                        managed={agent.isManaged}
                        onRename={(newName) => {
                          /* v0.4 stub: update participant name via PATCH;
                             intentionally not wired in this task to keep
                             diff minimal — task scope is integration. */
                          // eslint-disable-next-line no-console
                          console.log("rename", agent.participant_id, newName);
                          setOpenMenuFor(null);
                        }}
                        onCompact={() => {
                          void apiClient
                            .command(agent.participant_id, {
                              type: "slash",
                              command: "compact",
                            })
                            .catch(() => {
                              /* swallow */
                            });
                          setOpenMenuFor(null);
                        }}
                        onSlash={(command) => {
                          void apiClient
                            .command(agent.participant_id, {
                              type: "slash",
                              command,
                            })
                            .catch(() => {
                              /* swallow */
                            });
                          setOpenMenuFor(null);
                        }}
                        onInterrupt={() => {
                          void apiClient
                            .command(agent.participant_id, { type: "interrupt" })
                            .catch(() => {
                              /* swallow */
                            });
                          setOpenMenuFor(null);
                        }}
                        onMessage={(text) => {
                          void apiClient
                            .command(agent.participant_id, {
                              type: "message",
                              text,
                            })
                            .catch(() => {
                              /* swallow */
                            });
                          setOpenMenuFor(null);
                        }}
                        onOpenTerminal={() => {
                          if (
                            agent.tmux_session !== null &&
                            modalCtx !== null
                          ) {
                            modalCtx.openTerminalOverlay(agent.tmux_session);
                          }
                          setOpenMenuFor(null);
                        }}
                        onReconnect={() => {
                          if (
                            currentSessionId !== null &&
                            modalCtx !== null
                          ) {
                            modalCtx.openReconnect(
                              agent.participant_id,
                              currentSessionId,
                              agent.runtime_id ?? "claude",
                            );
                          }
                          setOpenMenuFor(null);
                        }}
                        onShowLogs={() => {
                          /* v0.4 stub: opens a future logs viewer.
                             For now log to console so the click is visible. */
                          // eslint-disable-next-line no-console
                          console.log("show logs", agent.participant_id);
                          setOpenMenuFor(null);
                        }}
                        onSayGoodbye={() => {
                          void (async () => {
                            try {
                              const t = await apiClient.getConfirmToken(
                                agent.participant_id,
                              );
                              await apiClient.goodbye(agent.participant_id, t);
                            } catch {
                              /* swallow */
                            }
                          })();
                          setOpenMenuFor(null);
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            {sortedTerminals.map((terminal) => (
              <TerminalChip
                key={terminal.tmux_session}
                tmuxSession={terminal.tmux_session}
                label={terminal.label}
                onClick={() => {
                  if (modalCtx !== null) {
                    modalCtx.openTerminalOverlay(terminal.tmux_session);
                  }
                }}
              />
            ))}

            <PlusButton
              runtimes={runtimes}
              onSpawnRuntime={onSpawnRuntime}
              onSpawnTerminal={onSpawnTerminal}
              onManageRuntimes={onManageRuntimes}
              tmuxMissing={tmuxMissing}
            />
          </div>

          <div
            className="participants"
            title="Participants"
            style={{ marginRight: 6 }}
          >
            {/* Only user avatars render here. Agent participants render as
                AgentChips in the chip strip above, so rendering them here too
                would duplicate identity and produce orphan bare avatars for
                un-managed agents (no name, no click, no presence dot). */}
            {sortedParticipants
              .filter((p) => p.kind === "user")
              .map((p) => (
                <span
                  key={p.id}
                  className="avatar lg user"
                  title={`${p.name} · ${p.id}`}
                  style={
                    p.color !== undefined ? { background: p.color } : undefined
                  }
                >
                  {initials(p.name ?? p.id)}
                </span>
              ))}
          </div>
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
            onClick={() => openModal("settings")}
          >
            <Settings size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
