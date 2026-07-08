import type { JSX } from "react";

export function RuntimePanelIntro(): JSX.Element {
  return (
    <>
      <h3 className="settings-h">Runtimes</h3>
      <div className="settings-sub">
        System detection, then the runtime catalog used by the "+" menu.
      </div>
    </>
  );
}

export function RuntimeListHeader(): JSX.Element {
  return (
    <div className="runtime-list-head">
      <h4 className="runtime-list-title">Runtimes list</h4>
    </div>
  );
}

export function RuntimeReadOnlyNote({
  note,
}: {
  note: string | undefined;
}): JSX.Element | null {
  if (note === undefined) return null;
  return (
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
      {note}
    </div>
  );
}

export function RuntimeInlineError({
  error,
}: {
  error: string | null;
}): JSX.Element | null {
  if (error === null) return null;
  return (
    <div role="alert" className="form-error" style={{ marginTop: 8 }}>
      {error}
    </div>
  );
}
