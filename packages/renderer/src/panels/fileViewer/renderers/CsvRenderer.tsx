import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";
import { FvLoading } from "../FileViewerLoading.js";

const NO_LOOSE_STRING_VALUES = {
  loading: "loading",
  error: "error",
  ready: "ready",
} as const;

export interface CsvRendererProps {
  path: string;
}

const MAX_ROWS = 5000;

/* Map each parsed record (header + body) to a 1-based SOURCE line number.
   Papa parses with `skipEmptyLines: true`, so blank source lines are dropped
   from `data` while source line counting keeps them — a record's index is not
   its source line. We walk the raw lines and assign each record the next
   NON-EMPTY raw line. Best-effort: a record that spans multiple raw lines
   (an embedded newline inside a quoted field) is anchored to its first line,
   which is the common-case-correct choice for row anchoring. */
export function sourceLinesForRecords(raw: string, recordCount: number): number[] {
  const lines = raw.split(/\r\n|\r|\n/);
  const result: number[] = [];
  let cursor = 0;
  for (let r = 0; r < recordCount; r++) {
    while (cursor < lines.length && (lines[cursor] ?? "").trim().length === 0) {
      cursor++;
    }
    /* 1-based; if we ran out of raw lines (shouldn't happen), keep advancing. */
    result.push(cursor + 1);
    cursor++;
  }
  return result;
}

export function CsvRenderer({ path }: CsvRendererProps): JSX.Element {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const scoped = useScopedFile(path);

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | {
        kind: "ready";
        headers: string[];
        rows: string[][];
        /* 1-based SOURCE line number for each body row (parallel to `rows`).
           Papa skips empty source lines (`skipEmptyLines`), so a rendered row
           index is NOT the source line — the rail anchors comments by these
           real numbers via `data-source-line`. */
        rowLines: number[];
        total: number;
        truncated: boolean;
      }
  >({ kind: NO_LOOSE_STRING_VALUES.loading });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: NO_LOOSE_STRING_VALUES.loading });
    if (scoped === null) {
      setState({ kind: NO_LOOSE_STRING_VALUES.error, message: "file is outside the project root" });
      return;
    }
    client
      .fetchFileText(scoped.scope, scoped.relPath, 8 * 1024 * 1024)
      .then((res) => {
        if (cancelled) return;
        const parsed = Papa.parse<string[]>(res.content, {
          skipEmptyLines: true,
        });
        const data = parsed.data;
        if (data.length === 0) {
          setState({
            kind: NO_LOOSE_STRING_VALUES.ready,
            headers: [],
            rows: [],
            rowLines: [],
            total: 0,
            truncated: res.truncated,
          });
          return;
        }
        const [head, ...rest] = data;
        const trimmed = rest.slice(0, MAX_ROWS);
        /* Source line per record (index 0 = header), so body row `ri` maps to
           `recordLines[ri + 1]`. */
        const recordLines = sourceLinesForRecords(res.content, data.length);
        const rowLines = trimmed.map((_, ri) => recordLines[ri + 1] ?? ri + 2);
        setState({
          kind: NO_LOOSE_STRING_VALUES.ready,
          headers: head ?? [],
          rows: trimmed,
          rowLines,
          total: rest.length,
          truncated: res.truncated || rest.length > MAX_ROWS,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: NO_LOOSE_STRING_VALUES.error,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, client, scoped?.relPath, JSON.stringify(scoped?.scope ?? null)]);

  if (state.kind === NO_LOOSE_STRING_VALUES.loading) {
    return <FvLoading />;
  }
  if (state.kind === NO_LOOSE_STRING_VALUES.error) {
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
            <tr key={ri} data-source-line={state.rowLines[ri]}>
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
