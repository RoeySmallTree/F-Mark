import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";

export interface CsvRendererProps {
  path: string;
}

const MAX_ROWS = 5000;

export function CsvRenderer({ path }: CsvRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | {
        kind: "ready";
        headers: string[];
        rows: string[][];
        total: number;
        truncated: boolean;
      }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    client
      .fetchFileText(path, 8 * 1024 * 1024)
      .then((res) => {
        if (cancelled) return;
        const parsed = Papa.parse<string[]>(res.content, {
          skipEmptyLines: true,
        });
        const data = parsed.data;
        if (data.length === 0) {
          setState({
            kind: "ready",
            headers: [],
            rows: [],
            total: 0,
            truncated: res.truncated,
          });
          return;
        }
        const [head, ...rest] = data;
        const trimmed = rest.slice(0, MAX_ROWS);
        setState({
          kind: "ready",
          headers: head ?? [],
          rows: trimmed,
          total: rest.length,
          truncated: res.truncated || rest.length > MAX_ROWS,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path, client]);

  if (state.kind === "loading") {
    return <div className="fv-loading">parsing CSV…</div>;
  }
  if (state.kind === "error") {
    return <div className="fv-error">failed to load CSV: {state.message}</div>;
  }
  if (state.headers.length === 0 && state.rows.length === 0) {
    return <div className="fv-loading">empty file</div>;
  }

  return (
    <div className="fv-csv-table-wrap">
      <table className="fv-csv-table">
        <thead>
          <tr>
            {state.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} title={cell}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {state.truncated ? (
        <div className="fv-loading">
          showing first {state.rows.length} of {state.total} rows
        </div>
      ) : null}
    </div>
  );
}
