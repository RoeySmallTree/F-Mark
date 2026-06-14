/* RuntimesPanel — Settings → Runtimes.
   Shows the system probe summary first (OS, installer, tmux), then renders
   the runtime catalog (claude/codex/opencode + custom entries) as a table.
   Each row has Edit + Remove buttons; builtin rows can be edited but not
   removed. The "Add runtime" button expands an inline form whose `executable`
   field is validated against the same regex the kernel uses
   (`^[a-zA-Z0-9_./-]+$`) and whose `id` field is validated against
   `^[a-z][a-z0-9_-]{0,31}$`. */

import { useMemo, useState, type JSX, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  isOfferableRuntimeId,
  type EnvProbeResult,
  type RuntimeEntry,
} from "@f-mark/shared";
import { avatarKind, iconMaskStyle } from "../../components/ParticipantAvatar.js";

export interface RuntimesPanelProps {
  runtimes: Record<string, RuntimeEntry>;
  onAdd(id: string, entry: RuntimeEntry): Promise<void>;
  onUpdate(id: string, entry: RuntimeEntry): Promise<void>;
  onRemove(id: string): Promise<void>;
  envProbe?: EnvProbeResult | null;
  onReprobe?(): Promise<void>;
  /* When set, surfaces a read-only banner and suppresses mutation controls. */
  readOnlyNote?: string;
}

const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const EXEC_RE = /^[a-zA-Z0-9_./-]+$/;

/* The kernel ships these IDs as builtins (see
   packages/kernel/src/runtimes/defaults.ts). Anything else is "custom". */
const BUILTIN_IDS = new Set(["claude", "codex", "opencode"]);

const ICON_CHOICES = ["bot", "claude", "codex", "opencode"] as const;
type IconName = (typeof ICON_CHOICES)[number];

function runtimeIconStyle(
  icon: string | undefined,
  id: string,
  entry: RuntimeEntry,
): ReturnType<typeof iconMaskStyle> {
  return iconMaskStyle(
    avatarKind({
      kind: "agent",
      runtimeId: icon === "bot" ? id : (icon ?? id),
      name: entry.displayName,
    }),
  );
}

interface FormState {
  /* `null` when the form is closed; a string id (possibly empty) when adding,
     or the existing id when editing (id is then read-only). */
  mode: "add" | "edit" | "closed";
  editingId: string | null;
  id: string;
  displayName: string;
  executable: string;
  argsText: string;
  envText: string;
  icon: IconName;
  readyDelayMs: string;
}

function closedForm(): FormState {
  return {
    mode: "closed",
    editingId: null,
    id: "",
    displayName: "",
    executable: "",
    argsText: "",
    envText: "",
    icon: "bot",
    readyDelayMs: "1500",
  };
}

function parseArgs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

function asIcon(v: string): IconName {
  return (ICON_CHOICES as readonly string[]).includes(v)
    ? (v as IconName)
    : "bot";
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function formatEnv(env: RuntimeEntry["env"]): string {
  if (env === undefined) return "";
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseEnvText(text: string): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("Env entries must use KEY=value lines.");
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (!ENV_KEY_RE.test(key)) {
      throw new Error(
        "Env keys must start with a letter or underscore and contain only letters, digits, and underscores.",
      );
    }
    env[key] = value;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

function RuntimePathStatus({
  available,
  okLabel = "on PATH",
  missingLabel = "missing",
  unknownLabel = "not probed",
}: {
  available: boolean | null;
  okLabel?: string;
  missingLabel?: string;
  unknownLabel?: string;
}): JSX.Element {
  const label =
    available === null ? unknownLabel : available ? okLabel : missingLabel;
  return (
    <span
      className={`runtime-path-pill ${available === null ? "unknown" : available ? "ok" : "missing"}`}
    >
      {label}
    </span>
  );
}

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

export function RuntimesPanel({
  runtimes,
  onAdd,
  onUpdate,
  onRemove,
  envProbe = null,
  onReprobe,
  readOnlyNote,
}: RuntimesPanelProps): JSX.Element {
  const [form, setForm] = useState<FormState>(() => closedForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  /* Optional read-only mode for callers that deliberately want to expose the
     catalog without mutation controls. */
  const readOnly = readOnlyNote !== undefined;

  const rows = useMemo(() => {
    return Object.entries(runtimes)
      .filter(([id]) => isOfferableRuntimeId(id))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, entry]) => ({
        id,
        entry,
        builtin: BUILTIN_IDS.has(id),
      }));
  }, [runtimes]);

  function openAdd(): void {
    setForm({ ...closedForm(), mode: "add" });
    setError(null);
  }

  function openEdit(id: string, entry: RuntimeEntry): void {
    setForm({
      mode: "edit",
      editingId: id,
      id,
      displayName: entry.displayName,
      executable: entry.executable,
      argsText: entry.args.join(" "),
      envText: formatEnv(entry.env),
      icon: asIcon(entry.icon ?? "bot"),
      readyDelayMs: String(entry.readyDelayMs ?? 1500),
    });
    setError(null);
  }

  function cancel(): void {
    setForm(closedForm());
    setError(null);
  }

  async function submit(): Promise<void> {
    if (form.mode === "closed") return;
    if (form.mode === "add" && !ID_RE.test(form.id)) {
      setError(
        "Invalid id: must match ^[a-z][a-z0-9_-]{0,31}$ (lowercase, starts with a letter).",
      );
      return;
    }
    if (form.mode === "add" && !isOfferableRuntimeId(form.id)) {
      setError("This runtime is no longer supported.");
      return;
    }
    if (form.displayName.trim().length === 0) {
      setError("Display name is required.");
      return;
    }
    if (!EXEC_RE.test(form.executable)) {
      setError(
        "Invalid executable: must match ^[a-zA-Z0-9_./-]+$ (letters, digits, _ . / -).",
      );
      return;
    }
    const readyDelayMs = Number(form.readyDelayMs);
    if (!Number.isFinite(readyDelayMs) || readyDelayMs < 0) {
      setError("readyDelayMs must be a non-negative number.");
      return;
    }
    let env: Record<string, string> | undefined;
    try {
      env = parseEnvText(form.envText);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const entry: RuntimeEntry = {
      displayName: form.displayName.trim(),
      executable: form.executable,
      args: parseArgs(form.argsText),
      icon: form.icon,
      readyDelayMs,
      ...(env !== undefined ? { env } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      if (form.mode === "add") {
        await onAdd(form.id, entry);
      } else if (form.editingId !== null) {
        await onUpdate(form.editingId, entry);
      }
      setForm(closedForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string): Promise<void> {
    setRemoveError(null);
    try {
      await onRemove(id);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleReprobe(): Promise<void> {
    if (onReprobe === undefined) return;
    setProbeBusy(true);
    setProbeError(null);
    try {
      await onReprobe();
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbeBusy(false);
    }
  }

  return (
    <>
      <h3 className="settings-h">Runtimes</h3>
      <div className="settings-sub">
        System detection, then the runtime catalog used by the "+" menu.
      </div>

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
                void handleReprobe();
              }}
            >
              <RefreshCw size={13} aria-hidden="true" />
              {probeBusy ? "Probing..." : "Re-probe"}
            </button>
          ) : null}
        </div>

        {envProbe === null ? (
          <div className="runtime-system-empty">
            No probe has run yet for this project.
          </div>
        ) : (
          <div className="runtime-system-stack">
            <SystemHeader label="OS" testId="runtime-probe-os">
              <code className="codish">{envProbe.os}</code>
            </SystemHeader>
            <SystemHeader label="Installer" testId="runtime-probe-installer">
              {envProbe.installer !== null ? (
                <code className="codish">{envProbe.installer}</code>
              ) : (
                <span className="runtime-system-muted">none detected</span>
              )}
            </SystemHeader>
            <SystemHeader label="tmux" testId="runtime-probe-tmux">
              <RuntimePathStatus
                available={envProbe.tmux}
                okLabel="available"
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

      <div className="runtime-list-head">
        <h4 className="runtime-list-title">Runtimes list</h4>
      </div>

      {readOnlyNote !== undefined ? (
        <div
          className="form-hint"
          role="note"
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            border: "1px dashed var(--line)",
            borderRadius: 6,
          }}
        >
          {readOnlyNote}
        </div>
      ) : null}

      <table
        className="runtimes-table"
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          fontFamily: "var(--sans)",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
                width: 36,
              }}
            >
              Icon
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              Display name
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              Executable
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
                width: 96,
              }}
            >
              PATH
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              Args
            </th>
            <th
              style={{
                textAlign: "left",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
                width: 80,
              }}
            >
              Type
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "6px 8px",
                color: "var(--ink-3)",
                fontWeight: 500,
                borderBottom: "1px solid var(--line-2)",
                width: 140,
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, entry, builtin }) => (
            <tr
              key={id}
              data-testid={`runtime-row-${id}`}
              data-runtime-id={id}
            >
              <td style={{ padding: "8px", verticalAlign: "middle" }}>
                <span
                  aria-hidden
                  className="runtime-icon"
                  title={entry.icon ?? "bot"}
                >
                  <span
                    className="icon-mask"
                    style={runtimeIconStyle(entry.icon, id, entry)}
                  />
                </span>
              </td>
              <td style={{ padding: "8px", verticalAlign: "middle" }}>
                <div style={{ color: "var(--ink)" }}>{entry.displayName}</div>
                <div
                  style={{
                    color: "var(--ink-4)",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                  }}
                >
                  {id}
                </div>
              </td>
              <td style={{ padding: "8px", verticalAlign: "middle" }}>
                <code className="codish">{entry.executable}</code>
              </td>
              <td style={{ padding: "8px", verticalAlign: "middle" }}>
                <RuntimePathStatus
                  available={envProbe?.runtimes[id] ?? null}
                />
              </td>
              <td style={{ padding: "8px", verticalAlign: "middle" }}>
                {entry.args.length === 0 ? (
                  <span style={{ color: "var(--ink-4)" }}>—</span>
                ) : (
                  <code className="codish">{entry.args.join(", ")}</code>
                )}
              </td>
              <td style={{ padding: "8px", verticalAlign: "middle" }}>
                <span
                  className="codish"
                  style={{ fontSize: 11, color: "var(--ink-3)" }}
                >
                  {builtin ? "builtin" : "custom"}
                </span>
              </td>
              <td
                style={{
                  padding: "8px",
                  textAlign: "right",
                  verticalAlign: "middle",
                }}
              >
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 12, marginRight: 6 }}
                  disabled={readOnly}
                  title={
                    readOnly
                      ? "Read-only runtime"
                      : undefined
                  }
                  onClick={() => openEdit(id, entry)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  disabled={readOnly || builtin}
                  title={
                    readOnly
                      ? "Read-only runtime"
                      : builtin
                        ? "Built-in runtimes cannot be removed"
                        : undefined
                  }
                  onClick={() => {
                    void handleRemove(id);
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                style={{
                  padding: 14,
                  color: "var(--ink-4)",
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                No runtimes registered.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {removeError !== null ? (
        <div role="alert" className="form-error" style={{ marginTop: 8 }}>
          {removeError}
        </div>
      ) : null}

      {form.mode === "closed" ? (
        readOnly ? null : (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn-solid" onClick={openAdd}>
              + Add runtime
            </button>
          </div>
        )
      ) : (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
          data-testid="runtime-form"
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="form-label">Runtime id</span>
              <input
                className="form-input"
                value={form.id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, id: e.target.value }))
                }
                placeholder="mybot"
                aria-label="Runtime id"
                disabled={form.mode === "edit"}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="form-label">Display name</span>
              <input
                className="form-input"
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
                placeholder="My Bot"
                aria-label="Display name"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="form-label">Executable</span>
              <input
                className="form-input"
                value={form.executable}
                onChange={(e) =>
                  setForm((f) => ({ ...f, executable: e.target.value }))
                }
                placeholder="claude"
                aria-label="Executable"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="form-label">Args (space-separated)</span>
              <input
                className="form-input"
                value={form.argsText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, argsText: e.target.value }))
                }
                placeholder="--flag value"
                aria-label="Args"
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                gridColumn: "1 / -1",
              }}
            >
              <span className="form-label">Env</span>
              <textarea
                className="form-textarea"
                value={form.envText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, envText: e.target.value }))
                }
                placeholder="OPENAI_API_KEY=..."
                aria-label="Env"
                rows={3}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="form-label">Icon</span>
              <select
                className="form-input"
                value={form.icon}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icon: asIcon(e.target.value) }))
                }
                aria-label="Icon"
              >
                {ICON_CHOICES.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="form-label">readyDelayMs</span>
              <input
                className="form-input"
                value={form.readyDelayMs}
                onChange={(e) =>
                  setForm((f) => ({ ...f, readyDelayMs: e.target.value }))
                }
                aria-label="readyDelayMs"
                inputMode="numeric"
              />
            </label>
          </div>

          {error !== null ? (
            <div role="alert" className="form-error">
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-solid"
              disabled={busy}
              onClick={() => {
                void submit();
              }}
            >
              {busy ? "Saving…" : "Save runtime"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={cancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
