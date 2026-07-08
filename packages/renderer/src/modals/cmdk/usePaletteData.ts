import { useEffect, useState } from "react";
import type { SearchHit } from "@f-mark/shared";
import {
  createClient,
  type SessionEventGroup,
  type SessionMeta,
} from "../../api/client.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
} as const;

const SEARCH_DEBOUNCE_MS = 200;

interface UseCmdKPaletteDataInput {
  query: string;
  sessions: SessionMeta[];
  token: string | null;
}

interface CmdKPaletteData {
  allEventGroups: SessionEventGroup[];
  allSessions: SessionMeta[];
  searchHits: SearchHit[];
}

export function useCmdKPaletteData(
  input: UseCmdKPaletteDataInput,
): CmdKPaletteData {
  const { query, sessions, token } = input;
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [allSessions, setAllSessions] = useState<SessionMeta[]>(sessions);
  const [allEventGroups, setAllEventGroups] = useState<SessionEventGroup[]>([]);

  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    let cancelled = false;
    void client
      .listAllSessions()
      .then((next) => {
        if (!cancelled) setAllSessions(Array.isArray(next) ? next : sessions);
      })
      .catch(() => {
        if (!cancelled) setAllSessions(sessions);
      });
    void client
      .listAllSessionEvents()
      .then((next) => {
        if (!cancelled) setAllEventGroups(Array.isArray(next) ? next : []);
      })
      .catch(() => {
        if (!cancelled) setAllEventGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, sessions]);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setSearchHits([]);
      return;
    }
    const handle = setTimeout(() => {
      const client = createClient({ baseUrl: "", token });
      void client
        .search(q, undefined, NO_LOOSE_STRING_VALUES.all, 200)
        .then((hits) => {
          setSearchHits(hits);
        })
        .catch(() => {
          // Search failures are non-fatal; leave existing hits in place.
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, token]);

  return { allEventGroups, allSessions, searchHits };
}
