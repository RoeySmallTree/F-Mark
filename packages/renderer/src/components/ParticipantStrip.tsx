import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Search, Settings } from "lucide-react";
import type { PresenceState } from "@f-mark/shared";
import { createManagedAgentsClient, isProcessApiDisabledError, PROCESS_API_DISABLED_MESSAGE } from "../api/managedAgents.js";
import { AgentChip } from "./AgentChip.js";
import { AgentActionMenu } from "./AgentActionMenu.js";
import { ParticipantAvatar } from "./ParticipantAvatar.js";
import { TerminalChip } from "./TerminalChip.js";
import { PlusButton } from "./PlusButton.js";
import { pendingAccessCountForParticipant } from "../cards/AccessRequestCard.js";
import { useAgentSpawnContext } from "../hooks/useAgentSpawn.js";
import { useFlipReorder } from "../hooks/useFlipReorder.js";
import { TopBarModalContext } from "../App.js";
import { useStore } from "../state/store.js";

interface ParticipantStripProps {
  variant?: "compose" | "topbar";
  activeAgentIds?: ReadonlySet<string>;
  showGlobalActions?: boolean;
  onOpenSearch?: () => void;
  onOpenSettings?: () => void;
  searchLabel?: string;
}

type AgentActionMenuPlacement = "below" | "above";

interface AgentActionMenuTriggerRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface AgentActionMenuAnchor {
  triggerRect: AgentActionMenuTriggerRect;
  top: number;
  left: number;
  placement: AgentActionMenuPlacement;
  maxHeight: number;
}

const AGENT_ACTION_MENU_WIDTH = 240;
const AGENT_ACTION_MENU_GAP = 4;
const AGENT_ACTION_MENU_VIEWPORT_PADDING = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function actionMenuTriggerRect(rect: DOMRect): AgentActionMenuTriggerRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function sameTriggerRect(a: AgentActionMenuTriggerRect, b: AgentActionMenuTriggerRect): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function placeAgentActionMenu(
  triggerRect: AgentActionMenuTriggerRect,
  menuSize: { width: number; height: number },
  viewport: { width: number; height: number },
): Omit<AgentActionMenuAnchor, "triggerRect"> {
  const maxHeight = Math.max(0, viewport.height - AGENT_ACTION_MENU_VIEWPORT_PADDING * 2);
  const menuWidth = Math.max(menuSize.width, AGENT_ACTION_MENU_WIDTH);
  const menuHeight = Math.min(Math.max(0, menuSize.height), maxHeight);

  const maxLeft = Math.max(
    AGENT_ACTION_MENU_VIEWPORT_PADDING,
    viewport.width - menuWidth - AGENT_ACTION_MENU_VIEWPORT_PADDING,
  );
  const left = clamp(
    triggerRect.right - menuWidth,
    AGENT_ACTION_MENU_VIEWPORT_PADDING,
    maxLeft,
  );

  const belowTop = triggerRect.bottom + AGENT_ACTION_MENU_GAP;
  const aboveTop = triggerRect.top - menuHeight - AGENT_ACTION_MENU_GAP;
  const spaceBelow = viewport.height - AGENT_ACTION_MENU_VIEWPORT_PADDING - belowTop;
  const spaceAbove = triggerRect.top - AGENT_ACTION_MENU_GAP - AGENT_ACTION_MENU_VIEWPORT_PADDING;
  const belowFits = spaceBelow >= menuHeight;
  const aboveFits = aboveTop >= AGENT_ACTION_MENU_VIEWPORT_PADDING;
  const placement: AgentActionMenuPlacement =
    belowFits || (!aboveFits && spaceBelow >= spaceAbove) ? "below" : "above";
  const rawTop = placement === "above" ? aboveTop : belowTop;
  const maxTop = Math.max(
    AGENT_ACTION_MENU_VIEWPORT_PADDING,
    viewport.height - menuHeight - AGENT_ACTION_MENU_VIEWPORT_PADDING,
  );

  return {
    top: clamp(rawTop, AGENT_ACTION_MENU_VIEWPORT_PADDING, maxTop),
    left,
    placement,
    maxHeight,
  };
}

function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function initialActionMenuAnchor(triggerRect: AgentActionMenuTriggerRect): AgentActionMenuAnchor {
  return {
    triggerRect,
    ...placeAgentActionMenu(
      triggerRect,
      { width: AGENT_ACTION_MENU_WIDTH, height: 0 },
      viewportSize(),
    ),
  };
}

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

export function suggestedParticipantId(runtimeId: string): string {
  const safeRuntime = runtimeId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `ag-${safeRuntime.length > 0 ? safeRuntime : "agent"}-${randomHex(2)}`;
}

export function ParticipantStrip({
  variant = "compose",
  activeAgentIds,
  showGlobalActions = false,
  onOpenSearch,
  onOpenSettings,
  searchLabel = "Open command palette",
}: ParticipantStripProps): JSX.Element {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const token = useStore((s) => s.token);
  const managedAgents = useStore((s) => s.managedAgents);
  const managedTerminals = useStore((s) => s.managedTerminals);
  const managedAgentsDisabledReason = useStore((s) => s.managedAgentsDisabledReason);
  const setManagedAgentsDisabledReason = useStore((s) => s.setManagedAgentsDisabledReason);
  const presence = useStore((s) => s.presence);
  const addManagedTerminal = useStore((s) => s.addManagedTerminal);
  const upsertParticipant = useStore((s) => s.upsertParticipant);
  const removeManagedAgent = useStore((s) => s.removeManagedAgent);
  const removePresence = useStore((s) => s.removePresence);
  const currentUserId = useStore((s) => s.currentUserId);
  const openSettings = useStore((s) => s.openSettings);
  const modalCtx = useContext(TopBarModalContext);

  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [openMenuAnchor, setOpenMenuAnchor] = useState<AgentActionMenuAnchor | null>(null);
  const [spawnTerminalError, setSpawnTerminalError] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const menuPopoverRef = useRef<HTMLDivElement | null>(null);

  const {
    runtimes,
    tmuxMissing,
    spawnDisabledReason,
    spawnError: runtimeSpawnError,
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
    onSpawnRuntime,
    onManageRuntimes,
  } = useAgentSpawnContext();

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );

  const allAgentChips = useMemo(() => {
    const managedById = new Map<string, (typeof managedAgents)[number]>();
    for (const a of managedAgents) managedById.set(a.participant_id, a);
    const entries = Object.entries(participants)
      .filter(([, p]) => p.kind === "agent" && currentSessionId !== null && p.active_session === currentSessionId)
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
    const order = (id: string): number => {
      if (activeAgentIds?.has(id)) return -1;
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
  }, [participants, managedAgents, presence, currentSessionId, events, activeAgentIds]);

  const userParticipants = useMemo(
    () =>
      Object.entries(participants)
        .map(([id, p]) => ({ id, ...p }))
        .filter((p) => p.kind === "user")
        .sort((a, b) => a.id.localeCompare(b.id)),
    [participants],
  );

  const sortedTerminals = useMemo(
    () => [...managedTerminals].sort((a, b) => a.tmux_session.localeCompare(b.tmux_session)),
    [managedTerminals],
  );

  useFlipReorder(stripRef, [
    allAgentChips.map((a) => `${a.participant_id}:${activeAgentIds?.has(a.participant_id) ? 1 : 0}`).join("|"),
  ]);

  const openAgent = useMemo(
    () => openMenuFor === null ? null : allAgentChips.find((a) => a.participant_id === openMenuFor) ?? null,
    [allAgentChips, openMenuFor],
  );

  useLayoutEffect(() => {
    if (openMenuFor === null || openMenuAnchor === null) return;
    const node = menuPopoverRef.current;
    if (node === null) return;
    const triggerRect = openMenuAnchor.triggerRect;

    const reposition = (): void => {
      const rect = node.getBoundingClientRect();
      const next = placeAgentActionMenu(
        triggerRect,
        {
          width: rect.width || AGENT_ACTION_MENU_WIDTH,
          height: rect.height,
        },
        viewportSize(),
      );
      setOpenMenuAnchor((current) => {
        if (current === null || !sameTriggerRect(current.triggerRect, triggerRect)) return current;
        if (
          current.top === next.top &&
          current.left === next.left &&
          current.placement === next.placement &&
          current.maxHeight === next.maxHeight
        ) {
          return current;
        }
        return { ...current, ...next };
      });
    };

    reposition();
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(reposition) : null;
    resizeObserver?.observe(node);
    window.addEventListener("resize", reposition);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [
    openMenuFor,
    openMenuAnchor?.triggerRect.bottom,
    openMenuAnchor?.triggerRect.left,
    openMenuAnchor?.triggerRect.right,
    openMenuAnchor?.triggerRect.top,
  ]);

  const onSpawnTerminal = useCallback(() => {
    setSpawnTerminalError(null);
    if (managedAgentsDisabledReason !== null) {
      setSpawnTerminalError(managedAgentsDisabledReason);
      return;
    }
    void apiClient
      .spawnTerminal()
      .then((resp) => {
        addManagedTerminal({ tmux_session: resp.tmux_session, label: resp.label });
        modalCtx?.openTerminalOverlay(resp.tmux_session);
      })
      .catch((e: unknown) => {
        if (isProcessApiDisabledError(e)) {
          setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
          setSpawnTerminalError(PROCESS_API_DISABLED_MESSAGE);
        } else {
          setSpawnTerminalError(e instanceof Error ? e.message : String(e));
        }
        console.error("spawn terminal failed", e);
      });
  }, [apiClient, addManagedTerminal, managedAgentsDisabledReason, modalCtx, setManagedAgentsDisabledReason]);

  const openProfileSettings = useCallback(() => {
    setOpenMenuFor(null);
    setOpenMenuAnchor(null);
    openSettings("profile");
  }, [openSettings]);

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
    const id = window.setTimeout(() => window.addEventListener("mousedown", onDocMouseDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenuFor]);

  return (
    <div className={`participant-strip participant-strip-${variant}`} title="Participants">
      <div className="participant-strip-scroll" ref={stripRef}>
        {allAgentChips.map((agent) => {
          const state: PresenceState = presence[agent.participant_id]?.state ?? "offline";
          const active = activeAgentIds?.has(agent.participant_id) ?? false;
          const color = participants[agent.participant_id]?.color ?? null;
          return (
            <div
              key={`agent:${agent.participant_id}`}
              data-flip-id={`agent:${agent.participant_id}`}
              className={`agent-chip-anchor${active ? " active-turn" : ""}`}
            >
              <AgentChip
                participantId={agent.participant_id}
                name={agent.name}
                runtimeId={agent.runtime_id}
                state={state}
                color={color}
                active={active}
                accessPending={agent.pendingAccessCount > 0}
                pendingAccessCount={agent.pendingAccessCount}
                runtimeState={agent.runtime_state}
                onClick={(event) => {
                  if (openMenuFor === agent.participant_id) {
                    setOpenMenuFor(null);
                    setOpenMenuAnchor(null);
                    return;
                  }
                  setOpenMenuAnchor(
                    initialActionMenuAnchor(actionMenuTriggerRect(event.currentTarget.getBoundingClientRect())),
                  );
                  setOpenMenuFor(agent.participant_id);
                }}
              />
            </div>
          );
        })}
        {userParticipants.map((p) => {
          const avatar = (
            <ParticipantAvatar participantId={p.id} participant={p} size="lg" title={`${p.name} · ${p.id}`} />
          );
          return (
            <div key={`user:${p.id}`} data-flip-id={`user:${p.id}`} className="topbar-user-anchor">
              {p.id === currentUserId ? (
                <button
                  type="button"
                  className="topbar-user-button"
                  aria-label="Open profile settings"
                  title="Open profile settings"
                  onClick={openProfileSettings}
                >
                  {avatar}
                </button>
              ) : (
                avatar
              )}
            </div>
          );
        })}
        {sortedTerminals.map((terminal) => (
          <TerminalChip
            key={terminal.tmux_session}
            tmuxSession={terminal.tmux_session}
            label={terminal.label}
            onClick={() => modalCtx?.openTerminalOverlay(terminal.tmux_session)}
          />
        ))}
        <PlusButton
          runtimes={runtimes}
          onSpawnRuntime={onSpawnRuntime}
          onSpawnTerminal={onSpawnTerminal}
          onManageRuntimes={onManageRuntimes}
          accessModeForRuntime={accessModeForRuntime}
          accessModeOptionsForRuntime={accessModeOptionsForRuntime}
          onAccessModeChange={setAccessModeForRuntime}
          tmuxMissing={tmuxMissing}
          spawnDisabledReason={spawnDisabledReason}
        />
        {spawnDisabledReason !== null || runtimeSpawnError !== null || spawnTerminalError !== null ? (
          <span
            className="topbar-spawn-error"
            role="alert"
            title={runtimeSpawnError ?? spawnTerminalError ?? spawnDisabledReason ?? undefined}
          >
            {managedAgentsDisabledReason !== null ? "Spawning disabled" : "Spawn failed"}
          </span>
        ) : null}
      </div>
      {showGlobalActions ? (
        <div className="participant-strip-actions">
          {onOpenSearch !== undefined ? (
            <button type="button" className="icon-btn" title={searchLabel} aria-label={searchLabel} onClick={onOpenSearch}>
              <Search size={15} aria-hidden="true" />
            </button>
          ) : null}
          {onOpenSettings !== undefined ? (
            <button type="button" className="icon-btn" title="Settings" aria-label="Open settings" onClick={onOpenSettings}>
              <Settings size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      {openAgent !== null && openMenuAnchor !== null
        ? createPortal(
            <div
              ref={menuPopoverRef}
              className={`agent-action-menu-popover placement-${openMenuAnchor.placement}`}
              data-placement={openMenuAnchor.placement}
              style={{
                top: openMenuAnchor.top,
                left: openMenuAnchor.left,
                maxHeight: openMenuAnchor.maxHeight,
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
                  if (existing !== undefined) upsertParticipant(id, { ...existing, name: newName });
                  void apiClient.rename(id, { display_name: newName }).catch((err) => console.error("rename failed", err));
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onCompact={() => {
                  void apiClient.command(openAgent.participant_id, { type: "slash", command: "compact" }).catch(() => {});
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onSlash={(command) => {
                  void apiClient.command(openAgent.participant_id, { type: "slash", command }).catch(() => {});
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onInterrupt={() => {
                  void apiClient.command(openAgent.participant_id, { type: "interrupt" }).catch(() => {});
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onMessage={(text) => {
                  void apiClient.command(openAgent.participant_id, { type: "message", text }).catch(() => {});
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onOpenTerminal={() => {
                  if (openAgent.tmux_session !== null) modalCtx?.openTerminalOverlay(openAgent.tmux_session);
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onReconnect={() => {
                  if (currentSessionId !== null) {
                    modalCtx?.openReconnect(openAgent.participant_id, currentSessionId, openAgent.runtime_id ?? "claude");
                  }
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onInstallHooks={() => {
                  const runtimeId = openAgent.runtime_id ?? "claude";
                  modalCtx?.openHookInstall(runtimeId, runtimeId === "claude" ? undefined : openAgent.participant_id);
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onShowLogs={() => {
                  console.log("show logs", openAgent.participant_id);
                  setOpenMenuFor(null);
                  setOpenMenuAnchor(null);
                }}
                onSayGoodbye={() => {
                  const id = openAgent.participant_id;
                  void (async () => {
                    try {
                      const t = await apiClient.getConfirmToken(id);
                      await apiClient.goodbye(id, t);
                      removeManagedAgent(id);
                      removePresence(id);
                    } catch (err) {
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
  );
}
