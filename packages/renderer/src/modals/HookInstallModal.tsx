/* HookInstallModal — Phase 12.
   Surfaces the kernel's manual hook-install instructions for a given
   runtime + participant. The user opens this modal from EnvProbeBanner
   (or the participant chip menu) when the hook-not-installed status
   shows up — the modal explains how to wire up the runtime's `Stop`
   hook to ping back into f-mark.

   POSTs `/managed-agents/hook-install-instructions?runtime_id=…&
   participant_id=…&user_participant_id=…` on mount; the response
   contains a `markdown` body + a list of `{ configPath, snippet }`
   per-step blocks. Each snippet gets a Copy button. */

import { useEffect, useMemo, useState, type JSX } from "react";
import { X } from "lucide-react";
import type { HookInstallInstructions } from "@f-mark/shared";
import type { ManagedAgentsClient } from "../api/managedAgents.js";
import { MarkdownRenderer } from "../render/MarkdownRenderer.js";
import { copyToClipboard } from "../render/copy.js";

export interface HookInstallModalProps {
  runtimeId: string;
  participantId: string;
  userParticipantId: string;
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
  const [error, setError] = useState<string | null>(null);

  /* Memoize the request shape so we don't re-fire if React re-runs the
     effect for unrelated reasons. The three identifiers are the only
     inputs that should trigger a fetch. */
  const request = useMemo(
    () => ({
      runtime_id: runtimeId,
      participant_id: participantId,
      user_participant_id: userParticipantId,
    }),
    [runtimeId, participantId, userParticipantId],
  );

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
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
    return () => {
      alive = false;
    };
  }, [apiClient, request]);

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
          <div className="modal-eyebrow">HOOK INSTALL</div>
          <h2 className="modal-title" id="hook-install-title">
            Manual hook setup
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
            <div role="alert" className="form-error">
              Failed to load instructions: {error}
            </div>
          ) : data === null ? (
            <div className="form-hint">Loading install instructions…</div>
          ) : (
            <>
              <div className="install-instructions">
                <MarkdownRenderer content={data.markdown} />
              </div>
              {data.manualSteps.map((step, idx) => (
                <ManualStep
                  key={`${step.configPath}-${idx}`}
                  configPath={step.configPath}
                  snippet={step.snippet}
                />
              ))}
            </>
          )}
        </div>
        <div className="modal-foot">
          <div className="hint">
            Runtime: <code>{runtimeId}</code> · Participant:{" "}
            <code>{participantId}</code>
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

interface ManualStepProps {
  configPath: string;
  snippet: string;
}

function ManualStep({ configPath, snippet }: ManualStepProps): JSX.Element {
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
        <span className="install-step-config-path">{configPath}</span>
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
