import { useMemo, useState, type JSX } from "react";

export type JsonMode = "tree" | "source" | "table";

interface Props {
  value: unknown;
  mode?: JsonMode;
  className?: string;
}

/**
 * Renders an arbitrary JSON-serialisable value in one of three modes:
 * - `tree`: recursive `<details>` / `<summary>` per object/array node, primitives
 *   inline. Top level opens by default; deeper levels start collapsed. Provides
 *   "expand all" / "collapse all" buttons next to the root.
 * - `source`: `JSON.stringify(value, null, 2)` inside `<pre class="fm-source">`.
 * - `table`: if `value` is an array of homogeneous objects, render a table whose
 *   columns are the union of keys. Otherwise falls back to tree mode.
 */
export function JsonRenderer({
  value,
  mode = "tree",
  className,
}: Props): JSX.Element {
  if (mode === "source") return <JsonSourceView value={value} className={className} />;
  if (mode === "table") return <JsonTableView value={value} className={className} />;
  return <JsonTreeView value={value} className={className} />;
}

interface ViewProps {
  value: unknown;
  className?: string;
}

function JsonSourceView({ value, className }: ViewProps): JSX.Element {
  const cls = "fm-source" + (className ? " " + className : "");
  const text = useMemo(() => safeStringify(value), [value]);
  return (
    <pre className={cls}>
      <code>{text}</code>
    </pre>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/* Tree mode                                                                  */
/* -------------------------------------------------------------------------- */

type ExpandKey = "default" | "all" | "none";

function JsonTreeView({ value, className }: ViewProps): JSX.Element {
  const [expandKey, setExpandKey] = useState<ExpandKey>("default");
  const cls = "fm-json-tree" + (className ? " " + className : "");

  return (
    <div className={cls}>
      <div className="fm-json-toolbar">
        <button
          type="button"
          className="fm-json-toolbar-btn"
          onClick={() => setExpandKey("all")}
        >
          expand all
        </button>
        <button
          type="button"
          className="fm-json-toolbar-btn"
          onClick={() => setExpandKey("none")}
        >
          collapse all
        </button>
      </div>
      <div className="fm-json-root">
        <JsonNode
          value={value}
          depth={0}
          expandKey={expandKey}
          label={null}
        />
      </div>
    </div>
  );
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  expandKey: ExpandKey;
  /** Label to render before the value: `key:`, `[i]:`, or null for root. */
  label: { kind: "key" | "index"; text: string } | null;
}

function JsonNode({
  value,
  depth,
  expandKey,
  label,
}: JsonNodeProps): JSX.Element {
  if (value === null) return <Leaf label={label} className="fm-json-null" text="null" />;
  const t = typeof value;
  if (t === "string") {
    return (
      <Leaf
        label={label}
        className="fm-json-string"
        text={JSON.stringify(value as string)}
      />
    );
  }
  if (t === "number") {
    return (
      <Leaf
        label={label}
        className="fm-json-number"
        text={String(value as number)}
      />
    );
  }
  if (t === "boolean") {
    return (
      <Leaf
        label={label}
        className="fm-json-bool"
        text={(value as boolean) ? "true" : "false"}
      />
    );
  }
  if (Array.isArray(value)) {
    return (
      <CollectionNode
        kind="array"
        value={value}
        depth={depth}
        expandKey={expandKey}
        label={label}
      />
    );
  }
  if (t === "object") {
    return (
      <CollectionNode
        kind="object"
        value={value as Record<string, unknown>}
        depth={depth}
        expandKey={expandKey}
        label={label}
      />
    );
  }
  // undefined / function / bigint / symbol — render as a fallback string
  return (
    <Leaf label={label} className="fm-json-null" text={String(value)} />
  );
}

interface LeafProps {
  label: JsonNodeProps["label"];
  className: string;
  text: string;
}

function Leaf({ label, className, text }: LeafProps): JSX.Element {
  return (
    <div className="fm-json-leaf">
      {label && <LabelSpan label={label} />}
      <span className={className}>{text}</span>
    </div>
  );
}

function LabelSpan({ label }: { label: NonNullable<JsonNodeProps["label"]> }): JSX.Element {
  if (label.kind === "key") {
    return (
      <span className="fm-json-key">
        {JSON.stringify(label.text)}
        <span className="fm-json-punct">: </span>
      </span>
    );
  }
  return (
    <span className="fm-json-index">
      [{label.text}]<span className="fm-json-punct">: </span>
    </span>
  );
}

interface CollectionNodeProps {
  kind: "object" | "array";
  value: Record<string, unknown> | unknown[];
  depth: number;
  expandKey: ExpandKey;
  label: JsonNodeProps["label"];
}

function CollectionNode({
  kind,
  value,
  depth,
  expandKey,
  label,
}: CollectionNodeProps): JSX.Element {
  const entries: Array<[string, unknown]> = kind === "array"
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const count = entries.length;
  const summary =
    kind === "array"
      ? `[ ${count} item${count === 1 ? "" : "s"} ]`
      : `{ ${count} key${count === 1 ? "" : "s"} }`;

  // Resolution rules:
  // - "all"  -> always open
  // - "none" -> always closed
  // - "default" -> open at the root (depth 0), closed elsewhere
  const initialOpen = useMemo(() => {
    if (expandKey === "all") return true;
    if (expandKey === "none") return false;
    return depth === 0;
  }, [expandKey, depth]);

  // Treat `expandKey` changes as authoritative: bump open state to match.
  const [open, setOpen] = useState(initialOpen);
  const [lastKey, setLastKey] = useState(expandKey);
  if (lastKey !== expandKey) {
    setLastKey(expandKey);
    setOpen(initialOpen);
  }

  return (
    <details
      className={"fm-json-details" + (open ? " open" : "")}
      open={open}
    >
      <summary
        className="fm-json-summary"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        {label && <LabelSpan label={label} />}
        <span className="fm-json-meta">{summary}</span>
      </summary>
      <div className="fm-json-children">
        {entries.map(([k, v]) => (
          <JsonNode
            key={k}
            value={v}
            depth={depth + 1}
            expandKey={expandKey}
            label={
              kind === "array"
                ? { kind: "index", text: k }
                : { kind: "key", text: k }
            }
          />
        ))}
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* Table mode                                                                 */
/* -------------------------------------------------------------------------- */

function JsonTableView({ value, className }: ViewProps): JSX.Element {
  const tableData = useMemo(() => buildTable(value), [value]);
  if (!tableData) {
    return <JsonTreeView value={value} className={className} />;
  }
  const { columns, rows } = tableData;
  const cls = "fm-json-table" + (className ? " " + className : "");
  return (
    <table className={cls}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c}>{renderCell(row[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
}

function buildTable(value: unknown): TableData | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: Record<string, unknown>[] = [];
  const columnSet = new Set<string>();
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const row = item as Record<string, unknown>;
    rows.push(row);
    for (const k of Object.keys(row)) columnSet.add(k);
  }
  if (columnSet.size === 0) return null;
  // Require at least one shared key across rows (loose homogeneity).
  const anyShared = Array.from(columnSet).some((k) =>
    rows.every((r) => k in r),
  );
  if (!anyShared) return null;
  return { columns: Array.from(columnSet), rows };
}

function renderCell(v: unknown): JSX.Element {
  if (v === undefined) return <span className="fm-json-null">—</span>;
  if (v === null) return <span className="fm-json-null">null</span>;
  if (typeof v === "string") return <span className="fm-json-string">{v}</span>;
  if (typeof v === "number") return <span className="fm-json-number">{String(v)}</span>;
  if (typeof v === "boolean") return <span className="fm-json-bool">{v ? "true" : "false"}</span>;
  return <span className="fm-json-meta">{safeStringify(v)}</span>;
}
