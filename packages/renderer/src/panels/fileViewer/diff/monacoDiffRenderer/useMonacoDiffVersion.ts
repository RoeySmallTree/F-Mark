import { useEffect, useMemo, useState } from "react";
import type { GitDiffMode, GitFileVersionResponse } from "@f-mark/shared";
import { createClient } from "../../../../api/client.js";
import { useStore } from "../../../../state/store.js";
import { useScopedFile } from "../../fileScope.js";

type ScopedFile = ReturnType<typeof useScopedFile>;

interface MonacoDiffVersionState {
  version: GitFileVersionResponse | null;
  error: string | null;
  scoped: ScopedFile;
}

interface UseMonacoDiffVersionOptions {
  path: string;
  wireMode: GitDiffMode;
  baseRef: string | null;
  sessionId: string | null;
  refreshKey: number;
}

export function useMonacoDiffVersion({
  path,
  wireMode,
  baseRef,
  sessionId,
  refreshKey,
}: UseMonacoDiffVersionOptions): MonacoDiffVersionState {
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const scoped = useScopedFile(path);
  const [version, setVersion] = useState<GitFileVersionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVersion(null);
    setError(null);
    if (scoped === null) {
      setError("file is outside the project root");
      return;
    }
    client
      .gitFileVersion({
        scope: scoped.scope,
        relPath: scoped.relPath,
        mode: wireMode,
        ...(baseRef !== null ? { base: baseRef } : {}),
        ...(sessionId !== null ? { sessionId } : {}),
      })
      .then((res) => {
        if (!cancelled) setVersion(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, client, wireMode, baseRef, sessionId, scoped?.relPath, JSON.stringify(scoped?.scope ?? null), refreshKey]);

  return { version, error, scoped };
}
