const NO_LOOSE_STRING_VALUES = {
  unavailable: "unavailable",
  noDiff: "no-diff",
  changes: "changes",
  off: "off",
  error: "error",
  loading: "loading",
} as const;

/* Single source of truth for "is there a diff to show for the active file?".
   Fetches the server hunks ONCE for the active path+mode so the chrome (the
   "No diff" chip + the inline/side-by-side toggle) and the body (diff renderer
   vs. plain-file fallback) always agree, and a revert refreshes them together.
   The per-renderer gitDiff fetch was removed in favour of this — the diff
   renderers now receive the resolved `diff` as a prop. */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { useScopedFile } from "../fileScope.js";
import type { GitDiffMode, GitDiffResponse } from "@f-mark/shared";

export type DiffPhase =
  | "off" // diff mode is "none"
  | "loading"
  | "error"
  | "unavailable" // not-git / base-not-found / not-found — no diff to show
  | "no-diff" // the file is unchanged for the selected mode → show the file
  | "changes"; // a real diff exists to render

export interface DiffOutcome {
  phase: DiffPhase;
  /** The resolved server diff (hunks/status/actions), or null until loaded. */
  diff: GitDiffResponse | null;
  error: string | null;
  /** Monotonic counter bumped by `refresh()`; pass to renderers that hold a
      secondary fetch (Monaco's file-version, Media's blob URLs) so a revert
      re-pulls them in lockstep with this hook's re-fetch. */
  refreshKey: number;
  /** Re-fetch the diff (call after a successful revert). Keeps the previous
      result visible while revalidating so the editor doesn't unmount. */
  refresh: () => void;
}

/** Classify a loaded diff response into a render phase. Pure — unit-tested. */
export function classifyDiffOutcome(diff: GitDiffResponse): DiffPhase {
  switch (diff.status) {
    case "not-git":
    case "base-not-found":
    case "not-found":
      return NO_LOOSE_STRING_VALUES.unavailable;
    case "no-change":
      return NO_LOOSE_STRING_VALUES.noDiff;
    default: {
      /* "ok" | "binary": a change exists when there are textual hunks OR a
         file-level (restore/delete) or rename action is offered. A response
         with neither is effectively unchanged. */
      const a = diff.actions;
      const hasChange =
        diff.hunks.length > 0 || a?.file === true || a?.rename === true;
      return hasChange ? NO_LOOSE_STRING_VALUES.changes : NO_LOOSE_STRING_VALUES.noDiff;
    }
  }
}

export function useDiffOutcome(
  absPath: string | null,
  wireMode: GitDiffMode | null,
  sessionId: string | null,
  baseRef: string | null,
): DiffOutcome {
  const token = useStore((s) => s.token);
  const scoped = useScopedFile(absPath ?? "");
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  const off = absPath === null || wireMode === null;
  const scopeJson = JSON.stringify(scoped?.scope ?? null);
  /* Distinguishes a navigation (new file/mode → clear + show loading) from a
     revert refresh (same target → revalidate without dropping the prior diff,
     so the editor stays mounted). */
  const idRef = useRef<string>("");

  useEffect(() => {
    if (off) {
      setDiff(null);
      setError(null);
      idRef.current = "";
      return;
    }
    const id = `${absPath}|${wireMode}|${baseRef ?? ""}|${scoped?.relPath ?? ""}|${scopeJson}`;
    const isNavigation = idRef.current !== id;
    idRef.current = id;
    if (isNavigation) {
      setDiff(null);
      setError(null);
    }
    if (scoped === null) {
      setError("file is outside the project root");
      return;
    }
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    client
      .gitDiff({
        scope: scoped.scope,
        relPath: scoped.relPath,
        mode: wireMode,
        ...(sessionId !== null ? { sessionId } : {}),
        ...(baseRef !== null ? { base: baseRef } : {}),
      })
      .then((res) => {
        if (!cancelled) {
          setDiff(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off, absPath, wireMode, sessionId, baseRef, scoped?.relPath, scopeJson, token, refreshKey]);

  let phase: DiffPhase;
  if (off) phase = NO_LOOSE_STRING_VALUES.off;
  else if (diff !== null) phase = classifyDiffOutcome(diff);
  else if (error !== null) phase = NO_LOOSE_STRING_VALUES.error;
  else phase = NO_LOOSE_STRING_VALUES.loading;

  return { phase, diff, error, refreshKey, refresh };
}
