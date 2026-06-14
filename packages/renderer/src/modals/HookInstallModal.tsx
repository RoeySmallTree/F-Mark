import { useEffect, useMemo, useState, type JSX } from "react";
import { X } from "lucide-react";
import type {
  HookInstallInstructions,
  HookInstallLocationStatus,
  HookInstallStatus,
} from "@f-mark/shared";
import type { ManagedAgentsClient } from "../api/managedAgents.js";
import { MarkdownRenderer } from "../render/MarkdownRenderer.js";
import { copyToClipboard } from "../render/copy.js";

export interface HookInstallModalProps {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  apiClient: ManagedAgentsClient;
  onClose(): void;
}

export function HookInstallModal({
  runtimeId,
  participantId,
  userParticipantId,
  apiClient,
  onClose,
}: HookInstallModalProps): JSX.Element {
  const [data, setData] = useState<HookInstallInstructions | null>(null);
  const [status, setStatus] = useState<HookInstallStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "prompt">("manual");
  const [applyBusy, setApplyBusy] = useState<"local" | "global" | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const canAutoApply = runtimeId === "claude";
  const runtimeLabel =
    runtimeId === "claude"
      ? "Claude"
      : runtimeId === "codex"
        ? "Codex"
        : runtimeId;

  /* Memoize the request shape so we don't re-fire if React re-runs the
     effect for unrelated reasons. The three identifiers are the only
     inputs that should trigger a fetch. */
  const request = useMemo(
    () =>
      runtimeId === "claude"
        ? { runtime_id: runtimeId }
        : {
            runtime_id: runtimeId,
            participant_id: participantId,
            user_participant_id: userParticipantId,
          },
    [runtimeId, participantId, userParticipantId],
  );

  useEffect(() => {
    let alive = true;
    setData(null);
    setStatus(null);
    setError(null);
    setStatusError(null);
    setApplyError(null);
    setApplyMessage(null);
    apiClient
      .hookInstallInstructions(request)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    apiClient
      .hookInstallStatus(request)
      .then((r) => {
        if (alive) setStatus(r);
      })
      .catch((e: unknown) => {
        if (alive) {
          setStatusError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      alive = false;
    };
  }, [apiClient, request]);

  async function onApply(scope: "local" | "global"): Promise<void> {
    setApplyBusy(scope);
    setApplyError(null);
    setApplyMessage(null);
    try {
      const response = await apiClient.hookInstallApply({ ...request, scope });
      setStatus(response.status);
      setApplyMessage(
        response.applied
          ? `Applied to ${response.configPath}`
          : `Already embedded in ${response.configPath}`,
      );
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyBusy(null);
    }
  }

  const promptSteps = data?.promptSteps ?? [];
  const showModePicker = promptSteps.length > 0;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
      data-modal="hook-install"
    >
      <div
        className="modal hook-install-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hook-install-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-eyebrow">HOOK SETUP</div>
          <h2 className="modal-title" id="hook-install-title">
            {`${runtimeLabel} hooks`}
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
          <HookInstallStatusPanel
            status={status}
            error={statusError}
            applyBusy={applyBusy}
            canAutoApply={canAutoApply}
            onApply={(scope) => {
              void onApply(scope);
            }}
          />
          {applyError !== null ? (
            <div role="alert" className="form-error hook-apply-message">
              {applyError}
            </div>
          ) : applyMessage !== null ? (
            <div className="form-hint hook-apply-message">{applyMessage}</div>
          ) : null}
          {error !== null ? (
            <div role="alert" className="form-error">
              Failed to load instructions: {error}
            </div>
          ) : data === null ? (
            <div className="form-hint">Loading install instructions…</div>
          ) : (
            <>
              {showModePicker ? (
                <div className="hook-install-mode" role="tablist">
                  <button
                    type="button"
                    className={mode === "manual" ? "on" : ""}
                    role="tab"
                    aria-selected={mode === "manual"}
                    onClick={() => setMode("manual")}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={mode === "prompt" ? "on" : ""}
                    role="tab"
                    aria-selected={mode === "prompt"}
                    onClick={() => setMode("prompt")}
                  >
                    Prompt
                  </button>
                </div>
              ) : null}
              {mode === "prompt" && promptSteps.length > 0 ? (
                promptSteps.map((step, idx) => (
                  <SnippetStep
                    key={`${step.label}-${idx}`}
                    label={step.label}
                    snippet={step.text}
                  />
                ))
              ) : data.manualSteps.length > 0 ? (
                data.manualSteps.map((step, idx) => (
                  <SnippetStep
                    key={`${step.configPath}-${idx}`}
                    label={step.configPath}
                    snippet={step.snippet}
                  />
                ))
              ) : (
                <div className="install-instructions">
                  <MarkdownRenderer content={data.markdown} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <div className="hint">
            Runtime: <code>{runtimeId}</code> ·{" "}
            {runtimeId === "claude" ? (
              <>
                Hook: <code>generic</code>
              </>
            ) : (
              <>
                Participant: <code>{participantId ?? "unknown"}</code>
              </>
            )}
          </div>
          <div className="foot-actions">
            <button type="button" className="btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface HookInstallStatusPanelProps {
  status: HookInstallStatus | null;
  error: string | null;
  applyBusy: "local" | "global" | null;
  canAutoApply: boolean;
  onApply(scope: "local" | "global"): void;
}

function HookInstallStatusPanel({
  status,
  error,
  applyBusy,
  canAutoApply,
  onApply,
}: HookInstallStatusPanelProps): JSX.Element {
  const locations = status?.locations ?? [];
  const actionLabel = (scope: "local" | "global") => {
    const location = locations.find((entry) => entry.scope === scope);
    return location?.status === "stale" || status?.status === "stale"
      ? "Update"
      : "Apply";
  };
  const busyActionLabel = (scope: "local" | "global") =>
    actionLabel(scope) === "Update" ? "Updating" : "Applying";
  return (
    <section className="hook-status-panel" aria-label="Hook status">
      <div className="hook-status-list">
        {locations.length > 0 ? (
          locations.map((location) => (
            <HookLocationRow key={location.scope} location={location} />
          ))
        ) : status !== null ? (
          <HookSingleStatusRow status={status} />
        ) : error !== null ? (
          <div className="hook-status-empty">Status unavailable: {error}</div>
        ) : (
          <div className="hook-status-empty">Checking hook status…</div>
        )}
      </div>
      {canAutoApply ? (
        <div className="hook-auto-actions">
          <button
            type="button"
            className="btn-solid"
            disabled={applyBusy !== null}
            onClick={() => onApply("local")}
          >
            {applyBusy === "local"
              ? `${busyActionLabel("local")} local`
              : `${actionLabel("local")} local`}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={applyBusy !== null}
            onClick={() => onApply("global")}
          >
            {applyBusy === "global"
              ? `${busyActionLabel("global")} global`
              : `${actionLabel("global")} global`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function HookSingleStatusRow({
  status,
}: {
  status: HookInstallStatus;
}): JSX.Element {
  const kind =
    status.status ??
    (status.installed
      ? "installed"
      : status.detectedEntries.length > 0
        ? "stale"
        : "missing");
  const badge =
    kind === "installed" ? "Embedded" : kind === "stale" ? "Update" : "Missing";
  const badgeClass =
    kind === "installed" ? "on" : kind === "stale" ? "warn" : "off";
  return (
    <div className="hook-status-row">
      <div className="hook-status-main">
        <span className="hook-status-scope">config</span>
        <span className="hook-status-path">{status.configPath}</span>
      </div>
      <span className={`hook-status-badge ${badgeClass}`}>{badge}</span>
    </div>
  );
}

function HookLocationRow({
  location,
}: {
  location: HookInstallLocationStatus;
}): JSX.Element {
  const kind =
    location.status ??
    (location.installed
      ? "installed"
      : location.detectedEntries.length > 0
        ? "stale"
        : "missing");
  const badge = location.error
    ? "Invalid JSON"
    : kind === "installed"
      ? "Embedded"
      : kind === "stale"
        ? "Update"
      : location.exists
        ? "Missing"
        : "No file";
  const badgeClass = location.error
    ? "error"
    : kind === "installed"
      ? "on"
      : kind === "stale"
        ? "warn"
      : "off";

  return (
    <div className="hook-status-row">
      <div className="hook-status-main">
        <span className="hook-status-scope">{location.scope}</span>
        <span className="hook-status-path">{location.configPath}</span>
      </div>
      <span className={`hook-status-badge ${badgeClass}`}>{badge}</span>
    </div>
  );
}

interface SnippetStepProps {
  label: string;
  snippet: string;
}

function SnippetStep({ label, snippet }: SnippetStepProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyToClipboard(snippet);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="snippet-box install-step-snippet" style={{ marginTop: 16 }}>
      <div className="snippet-head">
        <span className="install-step-config-path">{label}</span>
      </div>
      <pre className="snippet-body">{snippet}</pre>
      <button
        type="button"
        className={`copy-btn${copied ? " copied" : ""}`}
        onClick={() => {
          void onCopy();
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
