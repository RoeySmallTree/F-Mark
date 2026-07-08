import type { CSSProperties, JSX } from "react";
import type { EnvProbeResult, RuntimeEntry } from "@f-mark/shared";
import { AgentKindArt } from "../../../components/ParticipantAvatar.js";
import { runtimeIconKind, type RuntimeRowModel } from "./model.js";
import { RuntimePathStatus } from "./RuntimePathStatus.js";

const NO_LOOSE_STRING_VALUES = {
  left: "left",
  builtin: "builtin",
  custom: "custom",
} as const;

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  fontFamily: "var(--sans)",
};

const baseHeaderStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "var(--ink-3)",
  fontWeight: 500,
  borderBottom: "1px solid var(--line-2)",
};

const cellStyle: CSSProperties = {
  padding: "8px",
  verticalAlign: "middle",
};

const actionButtonStyle: CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
};

const mutedDashStyle: CSSProperties = { color: "var(--ink-4)" };

function RuntimeHeaderCell({
  children,
  width,
  align = NO_LOOSE_STRING_VALUES.left,
}: {
  children: string;
  width?: CSSProperties["width"];
  align?: CSSProperties["textAlign"];
}): JSX.Element {
  return (
    <th
      style={{
        ...baseHeaderStyle,
        textAlign: align,
        ...(width !== undefined ? { width } : {}),
      }}
    >
      {children}
    </th>
  );
}

function RuntimeRow({
  row,
  envProbe,
  readOnly,
  onEdit,
  onRemove,
}: {
  row: RuntimeRowModel;
  envProbe: EnvProbeResult | null;
  readOnly: boolean;
  onEdit(id: string, entry: RuntimeEntry): void;
  onRemove(id: string): void;
}): JSX.Element {
  const { id, entry, builtin } = row;
  return (
    <tr key={id} data-testid={`runtime-row-${id}`} data-runtime-id={id}>
      <td style={cellStyle}>
        <span
          aria-hidden
          className="runtime-icon"
          title={entry.icon ?? "bot"}
        >
          <AgentKindArt
            kind={runtimeIconKind(entry.icon, id, entry)}
            className="runtime-icon-art"
          />
        </span>
      </td>
      <td style={cellStyle}>
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
      <td style={cellStyle}>
        <code className="codish">{entry.executable}</code>
      </td>
      <td style={cellStyle}>
        <RuntimePathStatus available={envProbe?.runtimes[id] ?? null} />
      </td>
      <td style={cellStyle}>
        {entry.args.length === 0 ? (
          <span style={mutedDashStyle}>—</span>
        ) : (
          <code className="codish">{entry.args.join(", ")}</code>
        )}
      </td>
      <td style={cellStyle}>
        <span
          className="codish"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          {builtin ? NO_LOOSE_STRING_VALUES.builtin : NO_LOOSE_STRING_VALUES.custom}
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
          style={{ ...actionButtonStyle, marginRight: 6 }}
          disabled={readOnly}
          title={readOnly ? "Read-only runtime" : undefined}
          onClick={() => onEdit(id, entry)}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={actionButtonStyle}
          disabled={readOnly || builtin}
          title={
            readOnly
              ? "Read-only runtime"
              : builtin
                ? "Built-in runtimes cannot be removed"
                : undefined
          }
          onClick={() => onRemove(id)}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function EmptyRuntimeRow(): JSX.Element {
  return (
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
  );
}

export function RuntimeTable({
  rows,
  envProbe,
  readOnly,
  onEdit,
  onRemove,
}: {
  rows: RuntimeRowModel[];
  envProbe: EnvProbeResult | null;
  readOnly: boolean;
  onEdit(id: string, entry: RuntimeEntry): void;
  onRemove(id: string): void;
}): JSX.Element {
  return (
    <table className="runtimes-table" style={tableStyle}>
      <thead>
        <tr>
          <RuntimeHeaderCell width={36}>Icon</RuntimeHeaderCell>
          <RuntimeHeaderCell>Display name</RuntimeHeaderCell>
          <RuntimeHeaderCell>Executable</RuntimeHeaderCell>
          <RuntimeHeaderCell width={96}>PATH</RuntimeHeaderCell>
          <RuntimeHeaderCell>Args</RuntimeHeaderCell>
          <RuntimeHeaderCell width={80}>Type</RuntimeHeaderCell>
          <RuntimeHeaderCell width={140} align="right">
            Actions
          </RuntimeHeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <RuntimeRow
            key={row.id}
            row={row}
            envProbe={envProbe}
            readOnly={readOnly}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
        {rows.length === 0 ? <EmptyRuntimeRow /> : null}
      </tbody>
    </table>
  );
}
