import { useEffect, useMemo, useState, type JSX } from "react";
import {
  AlertTriangle,
  Check,
  Cpu,
  Plug,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  IntegrationCheck,
  IntegrationLocation,
  IntegrationPreflightResponse,
  IntegrationScope,
  IntegrationStatus,
  RuntimeAccessModeOption,
  SpawnResponse,
} from "@f-mark/shared";
import type { ManagedAgentsClient } from "../api/managedAgents.js";

export interface IntegrationSetupModalProps {
  runtimeId: string;
  participantId?: string;
  sessionId?: string;
  /** Optional display name for the spawned agent. When provided, it's
      passed through to /managed-agents/spawn so the participant lands
      with this name instead of the runtime default. */
  suggestedName?: string;
  accessMode?: string;
  accessModeOptions?: RuntimeAccessModeOption[];
  onAccessModeChange?(mode: string): void;
  initialPreflight?: IntegrationPreflightResponse;
  apiClient: ManagedAgentsClient;
  onClose(): void;
  onLaunched(response: SpawnResponse): void;
}

type BusyState = "preflight" | "apply" | "launch" | null;
type SetupTab = "global" | "local";
type SetupItemKind = "runtime" | "mcp" | "hooks";

function runtimeLabel(runtimeId: string): string {
  if (runtimeId === "claude") return "Claude";
  if (runtimeId === "codex") return "Codex";
  if (runtimeId === "opencode") return "Opencode";
  return runtimeId;
}

function scopeForTab(tab: SetupTab): IntegrationScope {
  return tab === "global" ? "user" : "project";
}

function tabLabel(tab: SetupTab): string {
  return tab === "global" ? "Globally" : "Locally";
}

function locationForTab(
  check: IntegrationCheck,
  tab: SetupTab,
): IntegrationLocation | null {
  const scope = scopeForTab(tab);
  const direct = check.locations.find((location) => location.scope === scope);
  if (direct !== undefined) return direct;
  if (tab === "local") {
    const local = check.locations.find((location) => location.scope === "local");
    if (local !== undefined) return local;
  }
  return check.locations.find((location) => location.status === "blocked") ?? null;
}

function readyStatus(status: IntegrationStatus | "unknown"): boolean {
  return status === "installed" || status === "not_required";
}

function needsActionStatus(status: IntegrationStatus | "unknown"): boolean {
  return status === "missing" || status === "stale";
}

function setupStatusClass(status: IntegrationStatus | "unknown"): string {
  if (readyStatus(status)) return "ready";
  if (status === "stale") return "warn";
  return "missing";
}

function actionLabel(status: IntegrationStatus | "unknown"): string {
  if (readyStatus(status)) return "Ready";
  if (status === "stale") return "Update";
  if (status === "missing") return "Setup";
  if (status === "blocked") return "Blocked";
  if (status === "unsupported") return "Unavailable";
  return "Unavailable";
}

function itemCopy(input: {
  kind: SetupItemKind;
  status: IntegrationStatus | "unknown";
  location: IntegrationLocation | null;
  runtimeAvailable?: boolean;
  runtimeReason?: string;
  tab: SetupTab;
}): string {
  if (input.kind === "runtime") {
    return input.runtimeAvailable === true
      ? "Installed and reachable"
      : input.runtimeReason ?? "Install the runtime first";
  }
  if (readyStatus(input.status)) return "Ready for this setup";
  if (input.status === "stale") return "Needs an update";
  if (input.status === "missing") return "Not set up yet";
  if (input.status === "blocked") {
    return input.location?.reason ?? "Needs manual attention";
  }
  if (input.status === "unsupported") {
    return input.location?.reason ?? `${tabLabel(input.tab)} setup is not available here`;
  }
  return `${tabLabel(input.tab)} setup is not available`;
}

function locationIssue(
  title: string,
  location: IntegrationLocation | null,
  tab: SetupTab,
): string {
  if (location?.reason !== undefined && location.reason.length > 0) {
    return `${title}: ${location.reason}`;
  }
  if (location?.status === "unsupported") {
    return `${title}: ${tabLabel(tab)} setup is not supported for this runtime.`;
  }
  if (location?.status === "blocked") {
    return `${title}: this setup needs manual attention.`;
  }
  return `${title}: setup cannot continue yet.`;
}

function selectedScopeReady(input: {
  preflight: IntegrationPreflightResponse;
  tab: SetupTab;
}): boolean {
  const mcpLocation = locationForTab(input.preflight.mcp, input.tab);
  const hookLocation = locationForTab(input.preflight.hooks, input.tab);
  return (
    input.preflight.runtime.available &&
    mcpLocation !== null &&
    hookLocation !== null &&
    readyStatus(mcpLocation.status) &&
    readyStatus(hookLocation.status)
  );
}

function selectedScopeNeedsApply(input: {
  preflight: IntegrationPreflightResponse;
  tab: SetupTab;
}): boolean {
  const mcpLocation = locationForTab(input.preflight.mcp, input.tab);
  const hookLocation = locationForTab(input.preflight.hooks, input.tab);
  return (
    (mcpLocation !== null && needsActionStatus(mcpLocation.status)) ||
    (hookLocation !== null && needsActionStatus(hookLocation.status))
  );
}

export function IntegrationSetupModal({
  runtimeId,
  participantId,
  sessionId,
  suggestedName,
  accessMode = "default",
  accessModeOptions = [],
  onAccessModeChange,
  initialPreflight,
  apiClient,
  onClose,
  onLaunched,
}: IntegrationSetupModalProps): JSX.Element {
  const [preflight, setPreflight] =
    useState<IntegrationPreflightResponse | null>(initialPreflight ?? null);
  const [setupTab, setSetupTab] = useState<SetupTab>("global");
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (initialPreflight !== undefined) {
      setPreflight(initialPreflight);
      return () => {
        alive = false;
      };
    }
    setBusy("preflight");
    setError(null);
    apiClient
      .preflight({ runtime_id: runtimeId, participant_id: participantId })
      .then((response) => {
        if (!alive) return;
        setPreflight(response);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setBusy(null);
      });
    return () => {
      alive = false;
    };
  }, [apiClient, initialPreflight, participantId, runtimeId]);

  const selectedMcpLocation = useMemo(
    () => (preflight === null ? null : locationForTab(preflight.mcp, setupTab)),
    [preflight, setupTab],
  );
  const selectedHookLocation = useMemo(
    () => (preflight === null ? null : locationForTab(preflight.hooks, setupTab)),
    [preflight, setupTab],
  );
  const setupReady = preflight !== null && selectedScopeReady({ preflight, tab: setupTab });
  const setupNeedsApply =
    preflight !== null && selectedScopeNeedsApply({ preflight, tab: setupTab });

  async function launch(): Promise<void> {
    setBusy("launch");
    setError(null);
    try {
      const spawned = await apiClient.spawn({
        runtime_id: runtimeId,
        session_id: sessionId,
        suggested_participant_id: participantId,
        name: suggestedName,
        access_mode: accessMode,
      });
      onLaunched(spawned);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function applySelectedSetup(): Promise<void> {
    if (preflight === null) return;
    const scope = scopeForTab(setupTab);
    setBusy("apply");
    setError(null);
    try {
      const applied = await apiClient.integrationApply({
        runtime_id: runtimeId,
        participant_id: participantId,
        scope,
      });
      setPreflight(applied);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function showRuntimeIssue(): void {
    if (preflight === null) return;
    const reason =
      preflight.runtime.reason !== undefined && preflight.runtime.reason.length > 0
        ? preflight.runtime.reason
        : `${preflight.runtime.executable} is not reachable from the F-Mark process.`;
    setError(`Runtime: ${reason}`);
  }

  function setupActionFor(
    title: "MCP" | "Hook",
    location: IntegrationLocation | null,
  ): (() => void) | null {
    if (location === null) {
      return () => setError(`${title}: no ${tabLabel(setupTab)} setup target was found.`);
    }
    if (needsActionStatus(location.status) && canApply) {
      return () => {
        void applySelectedSetup();
      };
    }
    if (needsActionStatus(location.status) && preflight?.runtime.available !== true) {
      return showRuntimeIssue;
    }
    if (location.status === "blocked" || location.status === "unsupported") {
      return () => setError(locationIssue(title, location, setupTab));
    }
    if (needsActionStatus(location.status)) {
      return () => setError(locationIssue(title, location, setupTab));
    }
    return null;
  }

  const canApply =
    preflight !== null &&
    preflight.runtime.available &&
    setupNeedsApply &&
    ((selectedMcpLocation !== null &&
      selectedMcpLocation.safe_auto_apply &&
      selectedMcpLocation.status !== "blocked" &&
      selectedMcpLocation.status !== "unsupported") ||
      (selectedHookLocation !== null &&
        selectedHookLocation.safe_auto_apply &&
        selectedHookLocation.status !== "blocked" &&
        selectedHookLocation.status !== "unsupported"));
  const blocked =
    selectedMcpLocation?.status === "blocked" ||
    selectedHookLocation?.status === "blocked";
  const primaryDisabled =
    busy !== null ||
    preflight === null ||
    blocked ||
    !setupReady;
  const primaryLabel =
    busy === "preflight"
      ? "Checking"
      : busy === "apply"
        ? "Applying"
        : busy === "launch"
          ? "Launching"
          : "Launch";

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal="integration-setup"
    >
      <div
        className="modal integration-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-setup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-eyebrow">INTEGRATION</div>
          <h2 className="modal-title" id="integration-setup-title">
            {runtimeLabel(runtimeId)}
          </h2>
          <button
            type="button"
            className="icon-btn modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="modal-body">
          {error !== null ? (
            <div role="alert" className="form-error integration-error">
              {error}
            </div>
          ) : null}
          {preflight === null ? (
            <div className="integration-loading">
              <RefreshCw size={14} aria-hidden /> Checking setup
            </div>
          ) : (
            <>
              <div className="integration-tabs" role="tablist" aria-label="Setup scope">
                {(["global", "local"] as SetupTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={setupTab === tab}
                    className={`integration-tab${setupTab === tab ? " active" : ""}`}
                    onClick={() => setSetupTab(tab)}
                  >
                    {tabLabel(tab)}
                  </button>
                ))}
              </div>
              {setupReady ? (
                <div className="integration-ready-label">
                  We're all set up and ready to go
                </div>
              ) : null}
              {accessModeOptions.length > 0 ? (
                <label className="integration-access-mode">
                  <span>
                    <b>Permission mode</b>
                    <small>
                      Used when this {runtimeLabel(runtimeId)} agent launches.
                    </small>
                  </span>
                  <select
                    value={accessMode}
                    disabled={busy !== null || onAccessModeChange === undefined}
                    onChange={(event) =>
                      onAccessModeChange?.(event.currentTarget.value)
                    }
                  >
                    {accessModeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                        {option.deprecated === true ? " (deprecated)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="integration-simple-list">
                <SetupItem
                  kind="runtime"
                  title="Runtime"
                  status={preflight.runtime.available ? "installed" : "missing"}
                  detail={itemCopy({
                    kind: "runtime",
                    status: preflight.runtime.available ? "installed" : "missing",
                    location: null,
                    runtimeAvailable: preflight.runtime.available,
                    runtimeReason: preflight.runtime.reason,
                    tab: setupTab,
                  })}
                  version={preflight.runtime.version}
                  busy={busy !== null}
                  onAction={preflight.runtime.available ? null : showRuntimeIssue}
                />
                <SetupItem
                  kind="mcp"
                  title="MCP"
                  status={selectedMcpLocation?.status ?? "unsupported"}
                  detail={itemCopy({
                    kind: "mcp",
                    status: selectedMcpLocation?.status ?? "unsupported",
                    location: selectedMcpLocation,
                    tab: setupTab,
                  })}
                  version={selectedMcpLocation?.version ?? preflight.mcp.expected_version}
                  busy={busy !== null}
                  onAction={setupActionFor("MCP", selectedMcpLocation)}
                />
                <SetupItem
                  kind="hooks"
                  title="Hook"
                  status={selectedHookLocation?.status ?? "unsupported"}
                  detail={itemCopy({
                    kind: "hooks",
                    status: selectedHookLocation?.status ?? "unsupported",
                    location: selectedHookLocation,
                    tab: setupTab,
                  })}
                  version={selectedHookLocation?.version ?? preflight.hooks.expected_version}
                  busy={busy !== null}
                  onAction={setupActionFor("Hook", selectedHookLocation)}
                />
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <div />
          <div className="foot-actions">
            <button
              type="button"
              className="btn-solid"
              disabled={primaryDisabled}
              onClick={() => {
                void launch();
              }}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupItem({
  kind,
  title,
  status,
  detail,
  version,
  busy,
  onAction,
}: {
  kind: SetupItemKind;
  title: string;
  status: IntegrationStatus | "unknown";
  detail: string;
  version?: string;
  busy: boolean;
  onAction: (() => void) | null;
}): JSX.Element {
  const ItemIcon =
    kind === "runtime" ? Cpu : kind === "mcp" ? Plug : ShieldCheck;
  const StateIcon = readyStatus(status)
    ? Check
    : status === "stale"
      ? AlertTriangle
      : X;
  const action = actionLabel(status);
  const actionDisabled = busy || onAction === null || readyStatus(status);
  return (
    <div className={`integration-setup-item ${setupStatusClass(status)}`}>
      <span className="integration-setup-kind">
        <ItemIcon size={18} aria-hidden />
      </span>
      <span className="integration-setup-state" aria-hidden>
        <StateIcon size={14} />
      </span>
      <span className="integration-setup-copy">
        <span className="integration-setup-title">{title}</span>
        <span className="integration-setup-detail">{detail}</span>
        {version !== undefined && readyStatus(status) ? (
          <span className="integration-setup-version">v {version}</span>
        ) : null}
      </span>
      <button
        type="button"
        className={`integration-setup-action ${setupStatusClass(status)}`}
        disabled={actionDisabled}
        onClick={() => onAction?.()}
      >
        {action}
      </button>
    </div>
  );
}
