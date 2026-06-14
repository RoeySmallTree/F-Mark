import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  Check,
  Eraser,
  Palette,
  Pause,
  Pencil,
  Play,
  PlugZap,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type { AgentStatusRow } from "@f-mark/shared";
import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";
import { runtimeAccessModeLabel } from "@f-mark/shared";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { createClient } from "../../api/client.js";
import {
  AccessRequestCard,
  accessRequestOpen,
} from "../../cards/AccessRequestCard.js";
import { TopBarModalContext } from "../../App.js";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import { useStore } from "../../state/store.js";
import { LogLevel, useSeqLog } from "../../hooks/useSeqLog.js";
import { AGENT_COLORS } from "../../lib/agentNaming.js";

type BusyAction =
  | "pause"
  | "resume"
  | "rename"
  | "recolor"
  | "reconnect"
  | "compact"
  | "clear"
  | "interrupt"
  | "goodbye";

function statusTone(agent: AgentStatusRow): string {
  if (agent.paused) return "paused";
  if (agent.connection_state === "connected") return agent.activity_state;
  return agent.connection_state;
}

function commandDisabledReason(agent: AgentStatusRow): string | null {
  if (agent.connection_state !== "connected") return "Agent is not connected";
  if (
    agent.activity_state === "running" ||
    agent.activity_state === "notified" ||
    agent.activity_state === "access-pending"
  ) {
    return `Agent is ${agent.activity_state}`;
  }
  return null;
}

function commandTitle(label: string, reason: string | null): string {
  return reason === null ? label : `${label}: ${reason}`;
}

export function RightAgents(): JSX.Element {
  const token = useStore((s) => s.token);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const managedAgents = useStore((s) => s.managedAgents);
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const modalCtx = useContext(TopBarModalContext);
  const api = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const restApi = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const upsertParticipant = useStore((s) => s.upsertParticipant);
  const [agents, setAgents] = useState<AgentStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{
    id: string;
    action: BusyAction;
  } | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [pickingColorFor, setPickingColorFor] = useState<string | null>(null);
  const [runtimeOptions, setRuntimeOptions] = useState<
    Record<string, { models: ModelDescriptor[]; efforts: EffortDescriptor[] }>
  >({});

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const status = await api.status(currentSessionId ?? undefined);
      setAgents(status.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, currentSessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh, managedAgents]);

  const log = useSeqLog("RightAgents");

  const run = useCallback(
    async (
      id: string,
      action: BusyAction,
      fn: () => Promise<unknown>,
    ): Promise<void> => {
      setBusy({ id, action });
      setError(null);
      log(
        "RightAgents action started",
        { participantId: id, action },
        LogLevel.Info,
      );
      try {
        await fn();
        await refresh();
        log(
          "RightAgents action ok",
          { participantId: id, action },
          LogLevel.Info,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(
          "RightAgents action failed",
          { participantId: id, action, error: message },
          LogLevel.Error,
        );
        setError(message);
      } finally {
        setBusy(null);
      }
    },
    [log, refresh],
  );

  const loadRuntimeOptions = useCallback(
    async (agent: AgentStatusRow): Promise<void> => {
      if (runtimeOptions[agent.participant_id] !== undefined) return;
      try {
        const modelId =
          agent.runtime_state?.configuredModel ?? agent.runtime_state?.model;
        const models = await api.runtimeModels(agent.participant_id);
        const efforts = await api.runtimeEfforts(agent.participant_id, modelId);
        setRuntimeOptions((prev) => ({
          ...prev,
          [agent.participant_id]: { models, efforts },
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [api, runtimeOptions],
  );

  if (agents.length === 0) {
    return (
      <>
        {error !== null && <p className="right-agents-error">{error}</p>}
        <LoadingAnimation className="panel-loading" />
      </>
    );
  }

  return (
    <div className="right-agents" data-testid="right-agents">
      {error !== null && <p className="right-agents-error">{error}</p>}
      {agents.map((agent) => {
        const tone = statusTone(agent);
        const commandReason = commandDisabledReason(agent);
        const compactDisabled =
          commandReason !== null || agent.runtime_id === null;
        const clearDisabled = commandReason !== null;
        const isBusy = busy?.id === agent.participant_id;
        const canOpenTerminal =
          agent.tmux_session !== null && modalCtx !== null;
        const isEditing = editing?.id === agent.participant_id;
        const isPickingColor = pickingColorFor === agent.participant_id;
        const agentColor =
          participants[agent.participant_id]?.color ?? null;
        const pendingRequests = events.filter(
          (event) =>
            event.participant_id === agent.participant_id &&
            accessRequestOpen(event, events),
        );

        async function applyColor(color: string): Promise<void> {
          const id = agent.participant_id;
          const existing = participants[id];
          /* Optimistic local update so the swatch and chip refresh
             instantly; the PATCH below is the source of truth and the
             /participants refresh will reconcile if it returns a
             different value (e.g. server-side normalization). */
          if (existing !== undefined) {
            upsertParticipant(id, { ...existing, color });
          }
          await run(id, "recolor", () =>
            restApi.updateParticipant(id, { color }),
          );
          setPickingColorFor(null);
        }

        return (
          <details
            key={agent.participant_id}
            className="agent-status-row"
            data-state={tone}
            onToggle={(event) => {
              if (event.currentTarget.open) {
                void loadRuntimeOptions(agent);
              }
            }}
            style={
              agentColor !== null
                ? ({ "--agent-color": agentColor } as CSSProperties)
                : undefined
            }
          >
            <summary className="agent-status-summary">
            <div className="agent-status-main">
              <div className="agent-status-dot" aria-hidden="true" />
              <div className="agent-status-title">
                {isEditing ? (
                  <form
                    className="agent-rename-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const next = editing.value.trim();
                      if (next.length === 0) return;
                      void run(agent.participant_id, "rename", () =>
                        api.rename(agent.participant_id, {
                          display_name: next,
                        }),
                      ).then(() => setEditing(null));
                    }}
                  >
                    <input
                      value={editing.value}
                      onChange={(event) =>
                        setEditing({
                          id: agent.participant_id,
                          value: event.target.value,
                        })
                      }
                      autoFocus
                    />
                    <button
                      type="submit"
                      title="Save name"
                      aria-label="Save name"
                    >
                      <Check size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Cancel rename"
                      aria-label="Cancel rename"
                      onClick={() => setEditing(null)}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span
                      className="agent-color-swatch"
                      aria-hidden="true"
                      title={
                        agentColor !== null
                          ? `Color ${agentColor}`
                          : "No color set"
                      }
                      style={
                        agentColor !== null
                          ? { background: agentColor }
                          : undefined
                      }
                    />
                    <b>{agent.display_name}</b>
                    <button
                      type="button"
                      className="agent-icon-link"
                      title="Rename"
                      aria-label={`Rename ${agent.display_name}`}
                      onClick={() =>
                        setEditing({
                          id: agent.participant_id,
                          value: agent.display_name,
                        })
                      }
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="agent-icon-link"
                      title={isPickingColor ? "Close color picker" : "Pick color"}
                      aria-label={`Pick color for ${agent.display_name}`}
                      aria-expanded={isPickingColor}
                      onClick={() =>
                        setPickingColorFor((cur) =>
                          cur === agent.participant_id
                            ? null
                            : agent.participant_id,
                        )
                      }
                    >
                      <Palette size={12} aria-hidden="true" />
                    </button>
                  </>
                )}
                <span>{agent.participant_id}</span>
              </div>
              {isPickingColor ? (
                <div
                  className="agent-color-picker"
                  role="listbox"
                  aria-label="Agent color"
                >
                  {AGENT_COLORS.map((color) => {
                    const selected = agentColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={`Color ${color}`}
                        title={color}
                        className={`agent-color-swatch picker${selected ? " selected" : ""}`}
                        style={{ background: color }}
                        disabled={isBusy}
                        onClick={() => {
                          void applyColor(color);
                        }}
                      >
                        {selected ? (
                          <Check size={11} aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="agent-status-badges">
                <span>{agent.runtime_id ?? "runtime"}</span>
                <span>{agent.connection_state}</span>
                <span>{agent.paused ? "paused" : agent.activity_state}</span>
                {agent.pending_access_count > 0 ? (
                  <span>{agent.pending_access_count} approval</span>
                ) : null}
              </div>
            </div>
            </summary>

            <div className="agent-metrics">
              <div>
                <span>Used context</span>
                <b>{formatContextTokens(agent, agent.context.used_tokens)}</b>
              </div>
              <div>
                <span>Available</span>
                <b>{formatContextTokens(agent, agent.context.max_tokens)}</b>
              </div>
              <div>
                <span>Model</span>
                <b>{agent.runtime_state?.model ?? agent.runtime_state?.configuredModel ?? "Unknown"}</b>
              </div>
              <div>
                <span>Effort</span>
                <b>{agent.runtime_state?.effort ?? agent.runtime_state?.configuredEffort ?? "Unknown"}</b>
              </div>
            </div>

            <div className="agent-detail-sections">
              <section className="agent-detail-section">
                <h4>Runtime</h4>
                <label>
                  <span>Model</span>
                  <select
                    value={agent.runtime_state?.configuredModel ?? agent.runtime_state?.model ?? ""}
                    disabled={isBusy}
                    onChange={(event) => {
                      const model = event.currentTarget.value;
                      void run(agent.participant_id, "reconnect", () =>
                        api.setRuntime(agent.participant_id, { model }),
                      );
                    }}
                  >
                    <option value="">
                      {agent.runtime_state?.model ?? "Not reported"}
                    </option>
                    {(runtimeOptions[agent.participant_id]?.models ?? []).map(
                      (model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  <span>Effort</span>
                  <select
                    value={agent.runtime_state?.configuredEffort ?? agent.runtime_state?.effort ?? ""}
                    disabled={isBusy}
                    onChange={(event) => {
                      const effort = event.currentTarget.value;
                      void run(agent.participant_id, "reconnect", () =>
                        api.setRuntime(agent.participant_id, { effort }),
                      );
                    }}
                  >
                    <option value="">
                      {agent.runtime_state?.effort ?? "Not reported"}
                    </option>
                    {(runtimeOptions[agent.participant_id]?.efforts ?? []).map(
                      (effort) => (
                        <option key={effort.id} value={effort.id}>
                          {effort.displayName}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <p>
                  Live source: {agent.runtime_state?.source ?? "unknown"}
                  {agent.runtime_state?.configuredModel !== undefined &&
                  agent.runtime_state.model !== undefined &&
                  agent.runtime_state.configuredModel !== agent.runtime_state.model
                    ? ` · configured ${agent.runtime_state.configuredModel}`
                    : ""}
                </p>
              </section>

              <section className="agent-detail-section">
                <h4>Permissions</h4>
                {agent.access.change_supported &&
                agent.access.supported_modes.length > 0 ? (
                  <label>
                    <span>Mode</span>
                    <select
                      value={agent.access.mode}
                      disabled={isBusy}
                      title={agent.access.reason}
                      onChange={(event) => {
                        const mode = event.currentTarget.value;
                        void run(agent.participant_id, "reconnect", () =>
                          api.setAccess(agent.participant_id, { mode }),
                        );
                      }}
                    >
                      {agent.access.supported_modes.map((mode) => (
                        <option key={mode} value={mode}>
                          {runtimeAccessModeLabel(agent.runtime_id, mode)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="agent-readonly-field">
                    {runtimeAccessModeLabel(agent.runtime_id, agent.access.mode)}
                  </div>
                )}
                {!agent.access.change_supported ||
                agent.access.supported_modes.length === 0 ? (
                  <p>{agent.access.reason ?? "Permission mode changes are unsupported."}</p>
                ) : null}
              </section>

              <section className="agent-detail-section">
                <h4>Context</h4>
                <p>
                  {contextPercent(agent) ??
                    agent.context.reason ??
                    contextFallback(agent)}
                </p>
              </section>
            </div>

            {pendingRequests.length > 0 ? (
              <div className="agent-access-requests">
                {pendingRequests.map((request) => (
                  <AccessRequestCard
                    key={request.filename}
                    event={request}
                    participants={participants}
                    allEvents={events}
                    compact
                  />
                ))}
              </div>
            ) : null}

            <div className="agent-controls">
              <button
                type="button"
                title={agent.paused ? "Resume" : "Pause"}
                aria-label={`${agent.paused ? "Resume" : "Pause"} ${agent.display_name}`}
                disabled={isBusy}
                onClick={() =>
                  void run(
                    agent.participant_id,
                    agent.paused ? "resume" : "pause",
                    () =>
                      agent.paused
                        ? api.resume(agent.participant_id)
                        : api.pause(agent.participant_id),
                  )
                }
              >
                {agent.paused ? (
                  <Play size={14} aria-hidden="true" />
                ) : (
                  <Pause size={14} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                title="Interrupt"
                aria-label={`Interrupt ${agent.display_name}`}
                disabled={isBusy || agent.connection_state !== "connected"}
                onClick={() =>
                  void run(agent.participant_id, "interrupt", () =>
                    api.command(agent.participant_id, { type: "interrupt" }),
                  )
                }
              >
                <Square size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={commandTitle("Compact", commandReason)}
                aria-label={`Compact ${agent.display_name}`}
                disabled={isBusy || compactDisabled}
                onClick={() =>
                  void run(agent.participant_id, "compact", () =>
                    api.compact(agent.participant_id),
                  )
                }
              >
                <Zap size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title={commandTitle("Clear", commandReason)}
                aria-label={`Clear ${agent.display_name}`}
                disabled={isBusy || clearDisabled}
                onClick={() => {
                  if (!window.confirm(`Clear ${agent.display_name}?`)) return;
                  void run(agent.participant_id, "clear", () =>
                    api.clear(agent.participant_id),
                  );
                }}
              >
                <Eraser size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Reconnect"
                aria-label={`Reconnect ${agent.display_name}`}
                disabled={isBusy || agent.connection_state === "connected"}
                onClick={() =>
                  void run(agent.participant_id, "reconnect", () =>
                    api.reconnect(agent.participant_id),
                  )
                }
              >
                <PlugZap size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Open terminal"
                aria-label={`Open ${agent.display_name} terminal`}
                disabled={!canOpenTerminal}
                onClick={() => {
                  if (agent.tmux_session !== null) {
                    modalCtx?.openTerminalOverlay(agent.tmux_session);
                  }
                }}
              >
                <Terminal size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Refresh"
                aria-label="Refresh agents"
                disabled={loading}
                onClick={() => void refresh()}
              >
                <RotateCcw size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Goodbye"
                aria-label={`Goodbye ${agent.display_name}`}
                disabled={isBusy}
                onClick={() => {
                  if (!window.confirm(`Remove ${agent.display_name}?`)) return;
                  void run(agent.participant_id, "goodbye", async () => {
                    const token = await api.getConfirmToken(agent.participant_id);
                    await api.goodbye(agent.participant_id, token);
                  });
                }}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function formatTokens(value: number | null): string {
  if (value === null) return "Unknown";
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

function formatContextTokens(agent: AgentStatusRow, value: number | null): string {
  if (value !== null) return formatTokens(value);
  return agent.context.status === "unsupported" ? "Unsupported" : "Not reported";
}

function contextPercent(agent: AgentStatusRow): string | null {
  const used = agent.context.used_tokens;
  const max = agent.context.max_tokens;
  if (used === null || max === null || max <= 0) return null;
  return `${Math.round((used / max) * 100)}% used`;
}

function contextFallback(agent: AgentStatusRow): string {
  if (agent.context.status === "unsupported") {
    return "Context usage is unsupported for this runtime.";
  }
  return "Context usage is not reported by this runtime.";
}
