import type { JSX } from "react";
import {
  Check,
  Plug,
  ShieldCheck,
} from "lucide-react";
import type { AgentSpawnRuntime } from "../../../hooks/useAgentSpawn.js";
import type { AgentIdentity } from "../types.js";
import {
  needsApply,
  providerActionLabel,
  readyStatus,
} from "./model.js";
import { StatusPill } from "./StatusPill.js";
import {
  EMPTY_RUNTIME_STATUS,
  type RuntimeStatus,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  checking: "Checking...",
} as const;

export function ProviderRow({
  runtime,
  status = EMPTY_RUNTIME_STATUS,
  chosen,
  onChoose,
  onApply,
}: {
  runtime: AgentSpawnRuntime;
  status?: RuntimeStatus;
  chosen: boolean;
  onChoose(runtimeId: string): AgentIdentity;
  onApply(runtimeId: string): Promise<void>;
}): JSX.Element {
  const preflight = status.preflight;
  const mcp = preflight?.mcp.status;
  const hooks = preflight?.hooks.status;
  const allReady =
    runtime.available && readyStatus(mcp) && readyStatus(hooks);
  const canApply =
    runtime.available && (needsApply(mcp) || needsApply(hooks));
  const actionLabel = providerActionLabel({
    applying: status.applying,
    mcp,
    hooks,
  });

  return (
    <div
      className={`ob-provider${chosen ? " chosen" : ""}${
        runtime.available ? "" : " unavailable"
      }`}
      role="radio"
      aria-checked={chosen}
      aria-disabled={!runtime.available}
      aria-label={`Use ${runtime.displayName} as your first agent`}
      tabIndex={runtime.available ? 0 : -1}
      title={
        runtime.available
          ? "Click to launch this provider as your first agent"
          : "Runtime not found on this machine"
      }
      onClick={() => {
        if (runtime.available) onChoose(runtime.id);
      }}
      onKeyDown={(e) => {
        if (runtime.available && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onChoose(runtime.id);
        }
      }}
    >
      <span className="ob-provider-radio" aria-hidden>
        {chosen ? <Check size={13} /> : null}
      </span>

      <div className="ob-provider-body">
        <div className="ob-provider-name">
          {runtime.displayName}
          {!runtime.available ? <span className="ob-provider-tag">not found</span> : null}
          {chosen ? <span className="ob-provider-tag chosen-tag">first agent</span> : null}
        </div>
        {runtime.available ? (
          <div className="ob-provider-checks">
            <StatusPill icon={<Plug size={11} />} label="MCP" status={mcp} loading={status.loading} />
            <StatusPill icon={<ShieldCheck size={11} />} label="Hooks" status={hooks} loading={status.loading} />
          </div>
        ) : (
          <div className="ob-provider-checks ob-provider-muted">
            Install the runtime CLI, then reopen onboarding.
          </div>
        )}
        {status.error !== null ? (
          <div className="form-error ob-provider-err" role="alert">
            {status.error}
          </div>
        ) : null}
      </div>

      <div className="ob-provider-action">
        {!runtime.available ? null : allReady ? (
          <span className="ob-provider-ready">
            <Check size={13} /> Ready
          </span>
        ) : (
          <button
            type="button"
            className="btn-solid ob-provider-setup"
            disabled={status.loading || status.applying || !canApply}
            onClick={(e) => {
              e.stopPropagation();
              void onApply(runtime.id);
            }}
          >
            {status.loading ? NO_LOOSE_STRING_VALUES.checking : actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
