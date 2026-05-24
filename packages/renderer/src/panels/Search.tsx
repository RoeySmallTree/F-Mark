import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import type { SearchHit } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";

const DEBOUNCE_MS = 220;

export function Search(): JSX.Element {
  const token = useStore((s) => s.token);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const [query, setQuery] = useState("");
  const [scoped, setScoped] = useState(true);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setHits([]);
      setBusy(false);
      setError(null);
      return;
    }
    setBusy(true);
    const seq = ++requestSeqRef.current;
    debounceRef.current = setTimeout(() => {
      const client = createClient({ baseUrl: "", token });
      void (async () => {
        try {
          const sessionForQuery =
            scoped && currentSessionId !== null
              ? currentSessionId
              : undefined;
          const next = await client.search(trimmed, sessionForQuery);
          if (seq === requestSeqRef.current) {
            setHits(next);
            setError(null);
            setBusy(false);
          }
        } catch (err) {
          if (seq === requestSeqRef.current) {
            setHits([]);
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [query, scoped, currentSessionId, token]);

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Search panel"
    >
      <div className="panel-head">
        <h3>SEARCH</h3>
      </div>
      <div className="panel-search">
        <SearchIcon
          size={12}
          aria-hidden="true"
          style={{ color: "var(--ink-4)" }}
        />
        <input
          placeholder="Search prose, choices, todos…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search query"
        />
      </div>
      <div
        style={{
          padding: "0 14px 8px",
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--ink-3)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={scoped}
            onChange={(e) => setScoped(e.target.checked)}
            disabled={currentSessionId === null}
            aria-label="Limit search to current session"
          />
          Limit to current session
        </label>
      </div>
      <div className="panel-list">
        {error !== null ? (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--rose)",
              padding: "4px 8px",
            }}
          >
            {error}
          </p>
        ) : null}
        {busy ? (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--ink-4)",
              padding: "4px 8px",
            }}
          >
            Searching…
          </p>
        ) : null}
        {!busy && error === null && query.trim().length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              padding: "10px 14px",
            }}
          >
            Type to search across sessions, named contributions, todos.
          </p>
        ) : null}
        {!busy && error === null && query.trim().length > 0 && hits.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              padding: "4px 8px",
            }}
          >
            No results.
          </p>
        ) : null}
        {hits.map((hit, idx) => (
          <div
            key={`${hit.session_id}:${hit.event.filename}`}
            className="session-item staggered-row"
            style={{ padding: "8px 10px", ["--i" as string]: Math.min(idx, 5) }}
          >
            <div className="row1">
              <span className="slug">{hit.event.kind}</span>
            </div>
            <div
              className="summary"
              style={{
                paddingLeft: 0,
                fontStyle: "italic",
                fontFamily: "var(--serif)",
              }}
            >
              {hit.snippet}
            </div>
            <div className="meta">
              <span>{hit.session_id}</span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
