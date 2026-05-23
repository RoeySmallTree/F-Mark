/* EnvProbePanel — Settings → Env probe.
   Surfaces the last `/env-probe` snapshot (held by the parent) and offers
   a Re-probe button that calls `apiClient.refreshEnvProbe()`. The parent
   owns the snapshot; the panel is purely presentational + a click target. */

import { useState, type JSX } from "react";
import type { EnvProbeResult } from "@f-mark/shared";

export interface EnvProbePanelProps {
  envProbe: EnvProbeResult | null;
  onReprobe(): Promise<void>;
}

function YesNo({ value }: { value: boolean }): JSX.Element {
  return (
    <span
      className="codish"
      style={{
        fontSize: 11.5,
        color: value
          ? "var(--green, var(--ink))"
          : "var(--rose, var(--ink-2))",
        padding: "2px 8px",
      }}
    >
      {value ? "yes" : "no"}
    </span>
  );
}

export function EnvProbePanel({
  envProbe,
  onReprobe,
}: EnvProbePanelProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReprobe(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onReprobe();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className="settings-h">Env probe</h3>
      <div className="settings-sub">
        Last detection of tmux, runtimes on <code className="codish">PATH</code>,
        and a usable package manager. Re-probe after installing anything.
      </div>

      {envProbe === null ? (
        <div
          style={{
            padding: 16,
            border: "1px dashed var(--line)",
            borderRadius: 8,
            fontStyle: "italic",
            color: "var(--ink-3)",
            fontSize: 13,
            fontFamily: "var(--serif)",
            marginBottom: 14,
          }}
        >
          No probe has run yet for this project — click Re-probe.
        </div>
      ) : (
        <>
          <div
            className="settings-row"
            style={{ alignItems: "center" }}
            data-testid="env-tmux-row"
          >
            <div className="settings-l">tmux</div>
            <div
              className="settings-r"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <YesNo value={envProbe.tmux} />
              {envProbe.tmux ? (
                <span
                  style={{
                    color: "var(--ink-3)",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                  }}
                >
                  v{envProbe.tmuxVersion ?? "?"}
                </span>
              ) : null}
            </div>
          </div>

          <div className="settings-row" style={{ alignItems: "flex-start" }}>
            <div className="settings-l" style={{ paddingTop: 4 }}>
              Runtimes
            </div>
            <div className="settings-r">
              {Object.keys(envProbe.runtimes).length === 0 ? (
                <span style={{ color: "var(--ink-4)" }}>
                  No runtimes registered.
                </span>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {Object.entries(envProbe.runtimes)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([id, present]) => (
                      <div
                        key={id}
                        data-testid={`env-runtime-row-${id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <code className="codish" style={{ minWidth: 80 }}>
                          {id}
                        </code>
                        <YesNo value={present} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="settings-row" style={{ alignItems: "center" }}>
            <div className="settings-l">Installer</div>
            <div className="settings-r">
              {envProbe.installer !== null ? (
                <code className="codish">{envProbe.installer}</code>
              ) : (
                <span style={{ color: "var(--ink-4)" }}>
                  none detected
                </span>
              )}
            </div>
          </div>

          <div className="settings-row" style={{ alignItems: "center" }}>
            <div className="settings-l">OS</div>
            <div className="settings-r">
              <code className="codish">{envProbe.os}</code>
            </div>
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="btn-solid"
          disabled={busy}
          onClick={() => {
            void handleReprobe();
          }}
        >
          {busy ? "Probing…" : "Re-probe"}
        </button>
        {error !== null ? (
          <span
            role="alert"
            className="form-error"
            style={{ marginTop: 0 }}
          >
            {error}
          </span>
        ) : null}
      </div>
    </>
  );
}
