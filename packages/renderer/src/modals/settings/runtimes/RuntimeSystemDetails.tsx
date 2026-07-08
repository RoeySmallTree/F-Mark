import type { JSX, ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { EnvProbeResult } from "@f-mark/shared";
import { RuntimePathStatus } from "./RuntimePathStatus.js";

const NO_LOOSE_STRING_VALUES = {
  probing: "Probing...",
  reProbe: "Re-probe",
  runtimeProbeOs: "runtime-probe-os",
  runtimeProbeInstaller: "runtime-probe-installer",
  runtimeProbeTmux: "runtime-probe-tmux",
  available: "available",
} as const;

function SystemHeader({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}): JSX.Element {
  return (
    <div className="runtime-system-header" data-testid={testId}>
      <div className="runtime-system-label">{label}</div>
      <div className="runtime-system-value">{children}</div>
    </div>
  );
}

export function RuntimeSystemDetails({
  envProbe,
  onReprobe,
  probeBusy,
  probeError,
}: {
  envProbe: EnvProbeResult | null;
  onReprobe?: () => Promise<void>;
  probeBusy: boolean;
  probeError: string | null;
}): JSX.Element {
  return (
    <section className="runtime-system" aria-label="System details">
      <div className="runtime-system-top">
        <div>
          <div className="runtime-system-kicker">System details</div>
          <div className="runtime-system-note">
            Last probe for this project environment.
          </div>
        </div>
        {onReprobe !== undefined ? (
          <button
            type="button"
            className="btn-ghost runtime-reprobe"
            disabled={probeBusy}
            onClick={() => {
              void onReprobe();
            }}
          >
            <RefreshCw size={13} aria-hidden="true" />
            {probeBusy ? NO_LOOSE_STRING_VALUES.probing : NO_LOOSE_STRING_VALUES.reProbe}
          </button>
        ) : null}
      </div>

      {envProbe === null ? (
        <div className="runtime-system-empty">
          No probe has run yet for this project.
        </div>
      ) : (
        <div className="runtime-system-stack">
          <SystemHeader label="OS" testId={NO_LOOSE_STRING_VALUES.runtimeProbeOs}>
            <code className="codish">{envProbe.os}</code>
          </SystemHeader>
          <SystemHeader label="Installer" testId={NO_LOOSE_STRING_VALUES.runtimeProbeInstaller}>
            {envProbe.installer !== null ? (
              <code className="codish">{envProbe.installer}</code>
            ) : (
              <span className="runtime-system-muted">none detected</span>
            )}
          </SystemHeader>
          <SystemHeader label="tmux" testId={NO_LOOSE_STRING_VALUES.runtimeProbeTmux}>
            <RuntimePathStatus
              available={envProbe.tmux}
              okLabel={NO_LOOSE_STRING_VALUES.available}
            />
            {envProbe.tmux ? (
              <code className="codish">v{envProbe.tmuxVersion ?? "?"}</code>
            ) : null}
          </SystemHeader>
        </div>
      )}

      {probeError !== null ? (
        <div role="alert" className="form-error runtime-probe-error">
          {probeError}
        </div>
      ) : null}
    </section>
  );
}
