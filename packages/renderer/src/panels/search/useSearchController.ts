import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { groupSearchHits } from "./groupHits.js";
import type { SearchController } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
} as const;

const DEBOUNCE_MS = 220;

export function useSearchController(): SearchController {
  const token = useStore((state) => state.token);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    clearDebounce(debounceRef);
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
      void runSearch({ token, query: trimmed, seq, requestSeqRef, setHits, setBusy, setError });
    }, DEBOUNCE_MS);
    return () => clearDebounce(debounceRef);
  }, [query, token]);

  return {
    query,
    setQuery,
    busy,
    error,
    hitCount: hits.length,
    pathHitGroups: useMemo(() => groupSearchHits(hits), [hits]),
  };
}

interface RunSearchInput {
  token: string | null;
  query: string;
  seq: number;
  requestSeqRef: { current: number };
  setHits(hits: SearchHit[]): void;
  setBusy(busy: boolean): void;
  setError(error: string | null): void;
}

async function runSearch({
  token,
  query,
  seq,
  requestSeqRef,
  setHits,
  setBusy,
  setError,
}: RunSearchInput): Promise<void> {
  const client = createClient({ baseUrl: "", token });
  try {
    const next = await client.search(query, undefined, NO_LOOSE_STRING_VALUES.all, 200);
    if (seq !== requestSeqRef.current) return;
    setHits(next);
    setError(null);
    setBusy(false);
  } catch (error) {
    if (seq !== requestSeqRef.current) return;
    setHits([]);
    setError(error instanceof Error ? error.message : String(error));
    setBusy(false);
  }
}

function clearDebounce(ref: {
  current: ReturnType<typeof setTimeout> | null;
}): void {
  if (ref.current === null) return;
  clearTimeout(ref.current);
  ref.current = null;
}
