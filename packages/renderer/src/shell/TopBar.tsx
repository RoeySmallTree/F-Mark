import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useFlipReorder } from "../hooks/useFlipReorder.js";
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
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";
import { TerminalChip } from "../components/TerminalChip.js";
import {
  PlusButton,
  type PlusButtonRuntime,
} from "../components/PlusButton.js";
import { AgentActionMenu } from "../components/AgentActionMenu.js";
import { pendingAccessCountForParticipant } from "../cards/AccessRequestCard.js";
import { EnvProbeBanner } from "../components/EnvProbeBanner.js";
import {
  createManagedAgentsClient,
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
} from "../api/managedAgents.js";
import { copyToClipboard } from "../render/copy.js";
import { TopBarModalContext } from "../App.js";
import { KNOWN_RUNTIMES } from "../runtimes.js";
import { useAgentSpawnContext } from "../hooks/useAgentSpawn.js";
import { PathSwitcher } from "./PathSwitcher.js";
import type { PresenceState } from "@f-mark/shared";

export const FMARK_GLYPH = `▟▙ ╱╲
▟▙ ▟▘▘`;

const COMMAND_PALETTE_SHORTCUT = chordToLabel("$mod+K");

function randomHex(bytes: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return Math.floor(Math.random() * 16 ** (bytes * 2))
    .toString(16)
    .padStart(bytes * 2, "0");
}

function suggestedParticipantId(runtimeId: string): string {
  const safeRuntime = runtimeId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `ag-${safeRuntime.length > 0 ? safeRuntime : "agent"}-${randomHex(2)}`;
}

export function TopBar(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const openModal = useStore((s) => s.openModal);
  const openSettings = useStore((s) => s.openSettings);
  const token = useStore((s) => s.token);
  const managedAgents = useStore((s) => s.managedAgents);
  const managedTerminals = useStore((s) => s.managedTerminals);
  const managedAgentsDisabledReason = useStore(
    (s) => s.managedAgentsDisabledReason,
  );
  const setManagedAgentsDisabledReason = useStore(
    (s) => s.setManagedAgentsDisabledReason,
  );
  const presence = useStore((s) => s.presence);
  const envProbe = useStore((s) => s.envProbe);
  const addManagedAgent = useStore((s) => s.addManagedAgent);
  const addManagedTerminal = useStore((s) => s.addManagedTerminal);
  const upsertParticipant = useStore((s) => s.upsertParticipant);
  const setPresence = useStore((s) => s.setPresence);
  const removeManagedAgent = useStore((s) => s.removeManagedAgent);
  const removePresence = useStore((s) => s.removePresence);
  const modalCtx = useContext(TopBarModalContext);

  /* Local UI: which AgentChip's action menu is open (anchored to that
     chip). null means "no menu open". */
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [openMenuAnchor, setOpenMenuAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [spawnTerminalError, setSpawnTerminalError] = useState<string | null>(
    null,
  );

  /* Runtime-spawn state is owned by App via useAgentSpawn so that the
     topbar's `+` menu and the empty-session AgentLauncher share the same
     preflight + IntegrationSetupModal. Terminal spawning stays local
     because TopBar is the only surface that triggers it. */
  const {
    runtimes,
    tmuxMissing,
    spawnDisabledReason,
    spawnError: runtimeSpawnError,
    onSpawnRuntime,
    onManageRuntimes,
  } = useAgentSpawnContext();

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

  const sortedParticipants = useMemo(() => {
    return Object.entries(participants)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => {
        if (a.kind === b.kind) return a.id.localeCompare(b.id);
        return a.kind === "user" ? -1 : 1;
      });
  }, [participants]);


  /* The PathSwitcher + AgentChip menus still need a synthesized "what
     runtimes do we know about" table independent of the spawn flow (display
     names, executables). Compute it once from KNOWN_RUNTIMES + the env-probe
     snapshot. */
  const probeRuntimes = useMemo<Record<string, boolean> | null>(() => {
    if (envProbe === null) return null;
    const r = (envProbe as { runtimes?: Record<string, boolean> }).runtimes;
    if (r === undefined || r === null) return null;
    return r;
  }, [envProbe]);

  const registeredRuntimes = useMemo(() => {
    const ids = new Set([
      ...Object.keys(KNOWN_RUNTIMES),
      ...(probeRuntimes !== null ? Object.keys(probeRuntimes) : []),
    ]);
    const out: Record<string, { displayName: string; executable: string }> = {};
    for (const id of ids) {
      out[id] = KNOWN_RUNTIMES[id] ?? { displayName: id, executable: id };
    }
    return out;
  }, [probeRuntimes]);

  /* Terminal spawn is local to TopBar — the empty-session launcher does
     not offer terminal spawning. We still tie the disabled gating to the
     same managedAgentsDisabledReason used elsewhere. */
  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const onSpawnTerminal = useCallback(() => {
    setSpawnTerminalError(null);
    if (managedAgentsDisabledReason !== null) {
      setSpawnTerminalError(managedAgentsDisabledReason);
      return;
    }
    void apiClient
      .spawnTerminal()
      .then((resp) => {
        addManagedTerminal({
          tmux_session: resp.tmux_session,
          label: resp.label,
        });
        modalCtx?.openTerminalOverlay(resp.tmux_session);
      })
      .catch((e: unknown) => {
        if (isProcessApiDisabledError(e)) {
          setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
          setSpawnTerminalError(PROCESS_API_DISABLED_MESSAGE);
        } else {
          setSpawnTerminalError(e instanceof Error ? e.message : String(e));
        }
        // eslint-disable-next-line no-console
        console.error("spawn terminal failed", e);
      });
  }, [
    apiClient,
    addManagedTerminal,
    managedAgentsDisabledReason,
    modalCtx,
    setManagedAgentsDisabledReason,
  ]);

  /* Build a single chip list sourced from participants joined with
     managedAgents (for tmux info and runtime_id). Scoped to the current
     session via `active_session` (the agent's `.f-mark/agents/{id}/
     active-session` file, enriched on /participants and updated on
     spawn / WS managed-agent.spawned). A brand-new session shows zero
     chips until an agent is spawned into it. Un-managed agents bound to
     this session still render a full AgentChip — chips are not predicated
     on managedAgents membership. */
  const allAgentChips = useMemo(() => {
    const managedById = new Map<string, (typeof managedAgents)[number]>();
    for (const a of managedAgents) {
      managedById.set(a.participant_id, a);
    }
    const entries = Object.entries(participants)
      .filter(
        ([, p]) =>
          p.kind === "agent" &&
          currentSessionId !== null &&
          p.active_session === currentSessionId,
      )
      .map(([id, p]) => {
        const managed = managedById.get(id);
        return {
          participant_id: id,
          name: p.name,
          runtime_id: managed?.runtime_id ?? p.runtime_id ?? null,
          tmux_session: managed?.tmux_session ?? null,
          isManaged: managed !== undefined,
          pendingAccessCount: pendingAccessCountForParticipant(id, events),
          runtime_state: managed?.runtime_state,
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
  }, [participants, managedAgents, presence, currentSessionId, events]);

  const sortedTerminals = useMemo(
    () =>
      [...managedTerminals].sort((a, b) =>
        a.tmux_session.localeCompare(b.tmux_session),
      ),
    [managedTerminals],
  );

  /* Whose turn it is, resolved to a concrete participant ID. The
     aggregate only carries the binary us/ag prefix, so for "us" we hand
     the highlight to the first user and for "ag" we hand it to the head
     of the presence-sorted chip list — that's the agent most likely to
     be the one actually mid-turn. Idle = no highlight. */
  const activeParticipantId = useMemo<string | null>(() => {
    if (effectiveTurn === "us") {
      const user = sortedParticipants.find((p) => p.kind === "user");
      return user?.id ?? null;
    }
    if (effectiveTurn === "ag") {
      return allAgentChips[0]?.participant_id ?? null;
    }
    return null;
  }, [effectiveTurn, sortedParticipants, allAgentChips]);

  /* Build the unified participant strip — user avatars and agent chips
     in one row, sorted so whoever currently holds the turn lands at the
     leftmost position. We render an explicit `type` so the FLIP reorder
     hook can map the same DOM element back to its previous position when
     the sort flips. Terminals and the +button trail after the
     participants so adding/removing them does not shuffle the
     participants' relative order. */
  type StripItem =
    | {
        kind: "agent";
        id: string;
        agent: (typeof allAgentChips)[number];
        active: boolean;
      }
    | {
        kind: "user";
        id: string;
        participant: (typeof sortedParticipants)[number];
        active: boolean;
      };

  const participantStrip = useMemo<StripItem[]>(() => {
    /* Two-pass: first compose the "resting" order (agents in their
       presence-sorted order from allAgentChips, then users), then hoist
       whoever currently has the turn to the leftmost position without
       shuffling anyone else. This preserves the existing chip
       sort-by-presence guarantee while still surfacing the active
       participant. */
    const items: StripItem[] = [];
    for (const agent of allAgentChips) {
      items.push({
        kind: "agent",
        id: agent.participant_id,
        agent,
        active: agent.participant_id === activeParticipantId,
      });
    }
    for (const p of sortedParticipants) {
      if (p.kind !== "user") continue;
      items.push({
        kind: "user",
        id: p.id,
        participant: p,
        active: p.id === activeParticipantId,
      });
    }
    const activeIdx = items.findIndex((it) => it.active);
    if (activeIdx > 0) {
      const [active] = items.splice(activeIdx, 1);
      items.unshift(active!);
    }
    return items;
  }, [allAgentChips, sortedParticipants, activeParticipantId]);

  const stripRef = useRef<HTMLDivElement | null>(null);
  useFlipReorder(stripRef, [
    participantStrip.map((i) => `${i.id}:${i.active ? 1 : 0}`).join("|"),
  ]);

  const openAgent = useMemo(
    () =>
      openMenuFor === null
        ? null
        : (allAgentChips.find((a) => a.participant_id === openMenuFor) ??
          null),
    [allAgentChips, openMenuFor],
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
      setOpenMenuAnchor(null);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setOpenMenuFor(null);
        setOpenMenuAnchor(null);
      }
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
          {/* Unified participant strip — user avatars and agent chips share
              one row. Whoever currently holds the turn is sorted to the
              leftmost position and rendered with a pulsing container; the
              FLIP hook smooths the position swap. Terminals and the
              spawn-+ trail after the participants. */}
          <div
            className="topbar-chips"
            ref={stripRef}
            title="Participants"
            data-active-turn={effectiveTurn}
          >
            {participantStrip.map((item) => {
              if (item.kind === "agent") {
                const agent = item.agent;
                const state: PresenceState =
                  presence[agent.participant_id]?.state ?? "offline";
                const color = participants[agent.participant_id]?.color ?? null;
                return (
                  <div
                    key={`agent:${agent.participant_id}`}
                    data-flip-id={`agent:${agent.participant_id}`}
                    className={`agent-chip-anchor${item.active ? " active-turn" : ""}`}
                  >
                    <AgentChip
                      participantId={agent.participant_id}
                      name={agent.name}
                      runtimeId={agent.runtime_id}
                      state={state}
                      color={color}
                      active={item.active}
                      accessPending={agent.pendingAccessCount > 0}
                      pendingAccessCount={agent.pendingAccessCount}
                      runtimeState={agent.runtime_state}
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        const menuWidth = 240;
                        setOpenMenuAnchor({
                          top: rect.bottom + 4,
                          left: Math.max(
                            8,
                            Math.min(
                              window.innerWidth - menuWidth - 8,
                              rect.right - menuWidth,
                            ),
                          ),
                        });
                        setOpenMenuFor((cur) =>
                          cur === agent.participant_id
                            ? null
                            : agent.participant_id,
                        );
                      }}
                    />
                  </div>
                );
              }
              const p = item.participant;
              return (
                <div
                  key={`user:${p.id}`}
                  data-flip-id={`user:${p.id}`}
                  className={`topbar-user-anchor${item.active ? " active-turn" : ""}`}
                >
                  <ParticipantAvatar
                    participantId={p.id}
                    participant={p}
                    size="lg"
                    title={`${p.name} · ${p.id}`}
                  />
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
              spawnDisabledReason={spawnDisabledReason}
            />
            {spawnDisabledReason !== null ||
            runtimeSpawnError !== null ||
            spawnTerminalError !== null ? (
              <span
                className="topbar-spawn-error"
                role="alert"
                title={
                  runtimeSpawnError ??
                  spawnTerminalError ??
                  spawnDisabledReason ??
                  undefined
                }
              >
                {managedAgentsDisabledReason !== null
                  ? "Spawning disabled"
                  : "Spawn failed"}
              </span>
            ) : null}
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
            onClick={() => openSettings("profile")}
          >
            <Settings size={15} aria-hidden="true" />
          </button>
        </div>
        {openAgent !== null && openMenuAnchor !== null
          ? createPortal(
              <div
                className="agent-action-menu-popover"
                style={{
                  top: openMenuAnchor.top,
                  left: openMenuAnchor.left,
                }}
              >
                <AgentActionMenu
                  participantId={openAgent.participant_id}
                  name={openAgent.name}
                  state={presence[openAgent.participant_id]?.state ?? "offline"}
                  managed={openAgent.isManaged}
                  onRename={(newName) => {
                    const id = openAgent.participant_id;
                    const existing = participants[id];
                    if (existing !== undefined) {
                      /* Reflect the rename locally before the round-trip so the
                         chip updates immediately; the WS managed-agent.updated
                         message will reconcile shortly after. */
                      upsertParticipant(id, { ...existing, name: newName });
                    }
                    void apiClient
                      .rename(id, { display_name: newName })
                      .catch((err) => {
                        // eslint-disable-next-line no-console
                        console.error("rename failed", err);
                      });
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onCompact={() => {
                    void apiClient
                      .command(openAgent.participant_id, {
                        type: "slash",
                        command: "compact",
                      })
                      .catch(() => {
                        /* swallow */
                      });
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onSlash={(command) => {
                    void apiClient
                      .command(openAgent.participant_id, {
                        type: "slash",
                        command,
                      })
                      .catch(() => {
                        /* swallow */
                      });
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onInterrupt={() => {
                    void apiClient
                      .command(openAgent.participant_id, { type: "interrupt" })
                      .catch(() => {
                        /* swallow */
                      });
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onMessage={(text) => {
                    void apiClient
                      .command(openAgent.participant_id, {
                        type: "message",
                        text,
                      })
                      .catch(() => {
                        /* swallow */
                      });
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onOpenTerminal={() => {
                    if (openAgent.tmux_session !== null && modalCtx !== null) {
                      modalCtx.openTerminalOverlay(openAgent.tmux_session);
                    }
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onReconnect={() => {
                    if (currentSessionId !== null && modalCtx !== null) {
                      modalCtx.openReconnect(
                        openAgent.participant_id,
                        currentSessionId,
                        openAgent.runtime_id ?? "claude",
                      );
                    }
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onInstallHooks={() => {
                    if (modalCtx !== null) {
                      const runtimeId = openAgent.runtime_id ?? "claude";
                      modalCtx.openHookInstall(
                        runtimeId,
                        runtimeId === "claude"
                          ? undefined
                          : openAgent.participant_id,
                      );
                    }
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onShowLogs={() => {
                    // eslint-disable-next-line no-console
                    console.log("show logs", openAgent.participant_id);
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                  onSayGoodbye={() => {
                    /* Capture the id BEFORE the menu closes — `openAgent`
                       is null after setOpenMenuFor(null) on the next
                       render, but the closure still has the value here. */
                    const id = openAgent.participant_id;
                    void (async () => {
                      try {
                        const t = await apiClient.getConfirmToken(id);
                        await apiClient.goodbye(id, t);
                        /* Optimistically clear local state in case the
                           WS `managed-agent.killed` event is missed
                           (disconnect, dropped frame, etc.). The store
                           reducer is idempotent, so a later WS event
                           just no-ops. */
                        removeManagedAgent(id);
                        removePresence(id);
                      } catch (err) {
                        /* Surface failures — silent swallow was hiding
                           confirm-token races, Origin-gate denials, and
                           "session not found" on already-dead panes. */
                        // eslint-disable-next-line no-console
                        console.error("goodbye failed", id, err);
                      }
                    })();
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                  }}
                />
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
