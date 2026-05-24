/* HookStatusPanel — Settings → Hooks.
   For each registered runtime, show whether its Stop hook is wired up to
   ping back into f-mark. The status is fetched via
   `apiClient.hookInstallStatus({ runtime_id, participant_id, user_participant_id })`
   when a representative agent participant is mapped to that runtime; if
   no participant exists yet, the row shows "Status unknown — needs a
   registered participant".

   The "Show install instructions" button fires
   `onShowInstructions(runtime_id, participant_id)`. The parent owns the
   HookInstallModal opening + close logic. */

import { useEffect, useMemo, useState, type JSX } from "react";
import type {
  HookInstallStatus,
  RuntimeEntry,
} from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";

export interface HookStatusPanelProps {
  runtimes: Record<string, RuntimeEntry>;
  /* Maps `runtime_id → participant_id` (a representative managed-agent
     participant for that runtime). Used to call /hook-install-status.
     A runtime without an entry shows "needs a registered participant". */
  participantIdForRuntime: Record<string, string>;
  userParticipantId: string | null;
  apiClient: ManagedAgentsClient;
  onShowInstructions(runtimeId: string, participantId: string): void;
}

type RowStatus =
  | { kind: "unknown" }
  | { kind: "loading" }
  | { kind: "installed"; configPath: string }
  | { kind: "not-required"; configPath: string }
  | { kind: "partial"; configPath: string }
  | { kind: "missing"; configPath: string }
  | { kind: "error"; message: string };

function classify(runtimeId: string, status: HookInstallStatus): RowStatus {
  if (runtimeId === "gemini" || status.expectedEntries.length === 0) {
    return { kind: "not-required", configPath: status.configPath };
  }
  if (status.installed) {
    return { kind: "installed", configPath: status.configPath };
  }
  if (status.detectedEntries.length > 0) {
    return { kind: "partial", configPath: status.configPath };
  }
  return { kind: "missing", configPath: status.configPath };
}

function StatusPill({ status }: { status: RowStatus }): JSX.Element {
  let label: string;
  let tone: string;
  switch (status.kind) {
    case "loading":
      label = "checking…";
      tone = "var(--ink-3)";
      break;
    case "unknown":
      label = "unknown";
      tone = "var(--ink-3)";
      break;
    case "installed":
      label = "installed";
      tone = "var(--green, var(--ink))";
      break;
    case "not-required":
      label = "not required";
      tone = "var(--green, var(--ink))";
      break;
    case "partial":
      label = "partial";
      tone = "var(--amber, var(--ink-2))";
      break;
    case "missing":
      label = "not installed";
      tone = "var(--rose, var(--ink-2))";
      break;
    case "error":
      label = `error: ${status.message}`;
      tone = "var(--rose, var(--ink-2))";
      break;
  }
  return (
    <span
      className="codish"
      style={{ fontSize: 11.5, color: tone, padding: "2px 8px" }}
      data-status={status.kind}
    >
      {label}
    </span>
  );
}

export function HookStatusPanel({
  runtimes,
  participantIdForRuntime,
  userParticipantId,
  apiClient,
  onShowInstructions,
}: HookStatusPanelProps): JSX.Element {
  const ids = useMemo(() => Object.keys(runtimes).sort(), [runtimes]);

  /* Map runtime_id → row state. The effect re-fetches when the inputs that
     drive the request change (participant mapping or user id). */
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});

  useEffect(() => {
    let alive = true;
    const next: Record<string, RowStatus> = {};
    for (const id of ids) {
      const participant = participantIdForRuntime[id];
      if (participant === undefined || participant.length === 0) {
        next[id] = { kind: "unknown" };
      } else {
        next[id] = { kind: "loading" };
      }
    }
    setStatuses(next);

    /* Issue one request per runtime that has a participant. We don't
       await sequentially — they're independent. */
    for (const id of ids) {
      const participant = participantIdForRuntime[id];
      if (participant === undefined || participant.length === 0) continue;
      apiClient
        .hookInstallStatus({
          runtime_id: id,
          participant_id: participant,
          ...(userParticipantId !== null
            ? { user_participant_id: userParticipantId }
            : {}),
        })
        .then((r) => {
          if (!alive) return;
          setStatuses((cur) => ({ ...cur, [id]: classify(id, r) }));
        })
        .catch((err: unknown) => {
          if (!alive) return;
          const msg = err instanceof Error ? err.message : String(err);
          setStatuses((cur) => ({
            ...cur,
            [id]: { kind: "error", message: msg },
          }));
        });
    }
    return () => {
      alive = false;
    };
  }, [ids, participantIdForRuntime, userParticipantId, apiClient]);

  return (
    <>
      <h3 className="settings-h">Hook status</h3>
      <div className="settings-sub">
        Claude and Codex need Stop hooks so F-Mark can hear turn-ends.
        Gemini uses manual-stream mode in v0.4, so it has no hook to install.
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
        data-testid="hook-status-list"
      >
        {ids.length === 0 ? (
          <div
            style={{
              padding: 16,
              border: "1px dashed var(--line)",
              borderRadius: 8,
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              fontFamily: "var(--serif)",
            }}
          >
            No runtimes registered.
          </div>
        ) : (
          ids.map((id) => {
            const runtime = runtimes[id]!;
            const participant = participantIdForRuntime[id];
            const status: RowStatus = statuses[id] ?? { kind: "unknown" };
            const hasParticipant =
              participant !== undefined && participant.length > 0;
            const manualStreamMode = id === "gemini";
            return (
              <div
                key={id}
                data-testid={`hook-row-${id}`}
                data-runtime-id={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  border: "1px solid var(--line-2)",
                  borderRadius: 8,
                  background: "var(--bg)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: "var(--ink)", fontSize: 13 }}>
                    {runtime.displayName}{" "}
                    <span
                      style={{
                        color: "var(--ink-4)",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                      }}
                    >
                      · {id}
                    </span>
                  </div>
                  {hasParticipant ? (
                    <div
                      style={{
                        color: "var(--ink-4)",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                      }}
                    >
                      via {participant}
                    </div>
                  ) : (
                    <div
                      style={{
                        color: "var(--ink-4)",
                        fontSize: 11.5,
                        fontStyle: "italic",
                      }}
                    >
                      Status unknown — needs a registered participant
                    </div>
                  )}
                </div>
                <StatusPill status={status} />
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  disabled={!hasParticipant}
                  title={
                    hasParticipant
                      ? manualStreamMode
                        ? "Show manual-stream note"
                        : "Show manual install steps"
                      : "Register a participant for this runtime first"
                  }
                  onClick={() => {
                    if (hasParticipant) {
                      onShowInstructions(id, participant);
                    }
                  }}
                >
                  {manualStreamMode
                    ? "Show manual-stream note"
                    : "Show install instructions"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
