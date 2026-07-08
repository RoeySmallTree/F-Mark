import { useEffect, useState } from "react";
import type { Preset } from "@f-mark/shared";
import { createClient } from "../../api/client.js";

export interface RemotePresetsState {
  builtin: Preset[];
  project: Preset[];
  loading: boolean;
  error: string | null;
}

export function useRemotePresets(
  token: string | null,
  sessionId: string | null,
): RemotePresetsState {
  const [builtin, setBuiltin] = useState<Preset[]>([]);
  const [project, setProject] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const client = createClient({ baseUrl: "", token });

    void (async () => {
      try {
        const response = await client.listPresets(sessionId ?? undefined);
        if (cancelled) return;
        setBuiltin(response.builtin);
        setProject(response.project);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, sessionId]);

  return { builtin, project, loading, error };
}
