/* RuntimesPanel — Settings → Runtimes.
   Renders the runtime catalog (claude/codex/gemini + custom entries) as
   a table. Each row has Edit + Remove buttons; builtin rows can be edited
   but not removed. The "Add runtime" button expands an inline form whose
   `executable` field is validated against the same regex the kernel uses
   (`^[a-zA-Z0-9_./-]+$`) and whose `id` field is validated against
   `^[a-z][a-z0-9-]{0,31}$`.

   The CRUD callbacks are provided by the parent (SettingsModal). In v0.4
   the kernel does not yet expose `/runtimes` HTTP routes — the panel still
   renders the form, but the parent wires the callbacks to no-ops with a
   note pointing users at `.f-mark/runtimes.json` for manual edits. */

import { useMemo, useState, type JSX } from "react";
import type { RuntimeEntry } from "@f-mark/shared";

export interface RuntimesPanelProps {
  runtimes: Record<string, RuntimeEntry>;
  onAdd(id: string, entry: RuntimeEntry): Promise<void>;
  onUpdate(id: string, entry: RuntimeEntry): Promise<void>;
  onRemove(id: string): Promise<void>;
  /* When set, surfaces a read-only banner explaining that CRUD is wired
     to a placeholder. The form still lets the user explore the validation,
     but Save will simply close the form (the parent's handler is a no-op). */
  readOnlyNote?: string;
}

const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const EXEC_RE = /^[a-zA-Z0-9_./-]+$/;

/* The kernel ships these three IDs as builtins (see
   packages/kernel/src/runtimes/defaults.ts). Anything else is "custom". */
const BUILTIN_IDS = new Set(["claude", "codex", "gemini"]);

const ICON_CHOICES = ["bot", "claude", "codex", "gemini"] as const;
type IconName = (typeof ICON_CHOICES)[number];

interface FormState {
  /* `null` when the form is closed; a string id (possibly empty) when adding,
     or the existing id when editing (id is then read-only). */
  mode: "add" | "edit" | "closed";
  editingId: string | null;
  id: string;
  displayName: string;
  executable: string;
  argsText: string;
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

export function RuntimesPanel({
  runtimes,
  onAdd,
  onUpdate,
  onRemove,
  readOnlyNote,
}: RuntimesPanelProps): JSX.Element {
  const [form, setForm] = useState<FormState>(() => closedForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  /* When the panel is in read-only mode (v0.4 — kernel exposes no /runtimes
     CRUD endpoints), every mutation surface is suppressed: Edit and Remove
     buttons go disabled, the Add Runtime button is hidden, and the inline
     form does not render. The user sees the catalog as a transparent
     listing plus the `readOnlyNote` explaining how to mutate via the
     filesystem. Avoids the prior "Save does nothing" UX. */
  const readOnly = readOnlyNote !== undefined;

  const rows = useMemo(() => {
    return Object.entries(runtimes)
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
        "Invalid id: must match ^[a-z][a-z0-9-]{0,31}$ (lowercase, starts with a letter).",
      );
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
    const entry: RuntimeEntry = {
      displayName: form.displayName.trim(),
      executable: form.executable,
      args: parseArgs(form.argsText),
      icon: form.icon,
      readyDelayMs,
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

  return (
    <>
      <h3 className="settings-h">Runtimes</h3>
      <div className="settings-sub">
        Runtimes registered in this project. Each one becomes a "+" menu entry
        for spawning a managed agent. Built-ins ship with F-Mark; custom
        entries live in <code className="codish">.f-mark/runtimes.json</code>.
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
                  className="codish"
                  style={{ fontSize: 11 }}
                  title={entry.icon ?? "bot"}
                >
                  {(entry.icon ?? "bot").slice(0, 1).toUpperCase()}
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
                      ? "Read-only: edit .f-mark/runtimes.json directly"
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
                      ? "Read-only: edit .f-mark/runtimes.json directly"
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
                colSpan={6}
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

          <div className="form-hint">
            Env variables can only be set by editing
            {" "}
            <code className="codish">.f-mark/runtimes.json</code> directly.
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
