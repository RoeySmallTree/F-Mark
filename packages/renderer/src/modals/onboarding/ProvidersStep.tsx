/* ProvidersStep — set up runtime integrations (MCP + hooks) WITHOUT launching
   an agent, and pick which provider becomes the first session's agent.

   Reuses the same preflight + integration-apply endpoints the real setup modal
   uses (apiClient.preflight / apiClient.integrationApply), but never calls
   spawn here — the actual launch happens once, in the wizard's finish step. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { AlertTriangle, Check, Plug, RefreshCw, ShieldCheck, X } from "lucide-react";
import type {
  IntegrationPreflightResponse,
  IntegrationScope,
  IntegrationStatus,
} from "@f-mark/shared";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { randomAgentColor, randomAgentName } from "../../lib/agentNaming.js";
import type { AgentSpawnRuntime } from "../../hooks/useAgentSpawn.js";
import { genParticipantId, type AgentIdentity } from "./types.js";

type Scope = Extract<IntegrationScope, "user" | "project">;

interface RuntimeStatus {
  loading: boolean;
  applying: boolean;
  preflight: IntegrationPreflightResponse | null;
  error: string | null;
}

const EMPTY: RuntimeStatus = {
  loading: false,
  applying: false,
  preflight: null,
  error: null,
};

function readyStatus(s: IntegrationStatus | "unknown" | undefined): boolean {
  return s === "installed" || s === "not_required";
}
function needsApply(s: IntegrationStatus | "unknown" | undefined): boolean {
  return s === "missing" || s === "stale";
}

export interface ProvidersStepProps {
  token: string | null;
  runtimes: AgentSpawnRuntime[];
  disabledReason: string | null;
  chosenRuntimeId: string | null;
  onChoose(runtimeId: string, identity: AgentIdentity): void;
}

export function ProvidersStep({
  token,
  runtimes,
  disabledReason,
  chosenRuntimeId,
  onChoose,
}: ProvidersStepProps): JSX.Element {
  const client = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const identities = useRef<Record<string, AgentIdentity>>({});
  const [scope, setScope] = useState<Scope>("user");
  const [statuses, setStatuses] = useState<Record<string, RuntimeStatus>>({});

  const ensureIdentity = useCallback((runtimeId: string): AgentIdentity => {
    const existing = identities.current[runtimeId];
    if (existing !== undefined) return existing;
    const identity: AgentIdentity = {
      participantId: genParticipantId(runtimeId),
      name: randomAgentName(),
      color: randomAgentColor(),
    };
    identities.current[runtimeId] = identity;
    return identity;
  }, []);

  const runPreflight = useCallback(
    async (runtimeId: string): Promise<void> => {
      const identity = ensureIdentity(runtimeId);
      setStatuses((s) => ({
        ...s,
        [runtimeId]: { ...(s[runtimeId] ?? EMPTY), loading: true, error: null },
      }));
      try {
        const preflight = await client.preflight({
          runtime_id: runtimeId,
          participant_id: identity.participantId,
        });
        setStatuses((s) => ({
          ...s,
          [runtimeId]: { loading: false, applying: false, preflight, error: null },
        }));
      } catch (e) {
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            loading: false,
            applying: false,
            preflight: null,
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }
    },
    [client, ensureIdentity],
  );

  const apply = useCallback(
    async (runtimeId: string): Promise<void> => {
      const identity = ensureIdentity(runtimeId);
      setStatuses((s) => ({
        ...s,
        [runtimeId]: { ...(s[runtimeId] ?? EMPTY), applying: true, error: null },
      }));
      try {
        const applied = await client.integrationApply({
          runtime_id: runtimeId,
          participant_id: identity.participantId,
          scope,
        });
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            loading: false,
            applying: false,
            preflight: applied,
            error: null,
          },
        }));
      } catch (e) {
        setStatuses((s) => ({
          ...s,
          [runtimeId]: {
            ...(s[runtimeId] ?? EMPTY),
            applying: false,
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }
    },
    [client, scope, ensureIdentity],
  );

  // Preflight every available runtime once, when the list first arrives or the
  // scope changes (status is scope-dependent).
  useEffect(() => {
    if (disabledReason !== null) return;
    for (const r of runtimes) {
      if (r.available) void runPreflight(r.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimes, scope, disabledReason]);

  // Auto-pick the first available runtime so the user can finish without
  // explicitly choosing; they can still re-pick.
  useEffect(() => {
    if (chosenRuntimeId !== null || disabledReason !== null) return;
    const first = runtimes.find((r) => r.available);
    if (first !== undefined) onChoose(first.id, ensureIdentity(first.id));
  }, [runtimes, chosenRuntimeId, disabledReason, onChoose, ensureIdentity]);

  if (disabledReason !== null) {
    return (
      <div className="ob-providers">
        <div className="form-error" role="alert">
          {disabledReason}
        </div>
        <p className="ob-hint">
          You can still finish onboarding — set up providers later from the
          top-bar <b>+</b> menu.
        </p>
      </div>
    );
  }

  return (
    <div className="ob-providers">
      <div className="ob-providers-head">
        <span className="ob-hint">
          Install the F-Mark MCP server + hooks for the agents you use. Nothing
          launches yet.
        </span>
        <div className="seg-control" role="radiogroup" aria-label="Setup scope">
          <button
            type="button"
            role="radio"
            aria-checked={scope === "user"}
            className={scope === "user" ? "on" : ""}
            onClick={() => setScope("user")}
          >
            Global
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === "project"}
            className={scope === "project" ? "on" : ""}
            onClick={() => setScope("project")}
          >
            Local
          </button>
        </div>
      </div>

      <div className="ob-provider-list">
        {runtimes.map((r) => {
          const st = statuses[r.id] ?? EMPTY;
          const pf = st.preflight;
          const mcp = pf?.mcp.status;
          const hooks = pf?.hooks.status;
          const allReady =
            r.available && readyStatus(mcp) && readyStatus(hooks);
          const canApply =
            r.available && (needsApply(mcp) || needsApply(hooks));
          const actionLabel = st.applying
            ? "Setting up…"
            : mcp === "stale" || hooks === "stale"
              ? "Update"
              : "Set up";
          const chosen = chosenRuntimeId === r.id;
          return (
            <div
              key={r.id}
              className={`ob-provider${chosen ? " chosen" : ""}${
                r.available ? "" : " unavailable"
              }`}
              role="radio"
              aria-checked={chosen}
              aria-disabled={!r.available}
              aria-label={`Use ${r.displayName} as your first agent`}
              tabIndex={r.available ? 0 : -1}
              title={
                r.available
                  ? "Click to launch this provider as your first agent"
                  : "Runtime not found on this machine"
              }
              onClick={() => {
                if (r.available) onChoose(r.id, ensureIdentity(r.id));
              }}
              onKeyDown={(e) => {
                if (r.available && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onChoose(r.id, ensureIdentity(r.id));
                }
              }}
            >
              <span className="ob-provider-radio" aria-hidden>
                {chosen ? <Check size={13} /> : null}
              </span>

              <div className="ob-provider-body">
                <div className="ob-provider-name">
                  {r.displayName}
                  {!r.available ? (
                    <span className="ob-provider-tag">not found</span>
                  ) : null}
                  {chosen ? (
                    <span className="ob-provider-tag chosen-tag">
                      first agent
                    </span>
                  ) : null}
                </div>
                {r.available ? (
                  <div className="ob-provider-checks">
                    <StatusPill icon={<Plug size={11} />} label="MCP" status={mcp} loading={st.loading} />
                    <StatusPill icon={<ShieldCheck size={11} />} label="Hooks" status={hooks} loading={st.loading} />
                  </div>
                ) : (
                  <div className="ob-provider-checks ob-provider-muted">
                    Install the runtime CLI, then reopen onboarding.
                  </div>
                )}
                {st.error !== null ? (
                  <div className="form-error ob-provider-err" role="alert">
                    {st.error}
                  </div>
                ) : null}
              </div>

              <div className="ob-provider-action">
                {!r.available ? null : allReady ? (
                  <span className="ob-provider-ready">
                    <Check size={13} /> Ready
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-solid ob-provider-setup"
                    disabled={st.loading || st.applying || !canApply}
                    onClick={(e) => {
                      e.stopPropagation();
                      void apply(r.id);
                    }}
                  >
                    {st.loading ? "Checking…" : actionLabel}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  status,
  loading,
}: {
  icon: JSX.Element;
  label: string;
  status: IntegrationStatus | "unknown" | undefined;
  loading: boolean;
}): JSX.Element {
  const cls = loading
    ? "loading"
    : readyStatus(status)
      ? "ready"
      : status === "stale"
        ? "warn"
        : status === undefined
          ? "loading"
          : "missing";
  const StateIcon = loading
    ? RefreshCw
    : readyStatus(status)
      ? Check
      : status === "stale"
        ? AlertTriangle
        : X;
  return (
    <span className={`ob-pill ${cls}`}>
      {icon}
      {label}
      <StateIcon size={11} className="ob-pill-state" />
    </span>
  );
}
