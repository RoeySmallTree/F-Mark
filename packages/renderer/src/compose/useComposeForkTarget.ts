import { useMemo } from "react";
import { useStore } from "../state/store.js";

export function useComposeForkTarget(sessionId: string | null): {
  id: string;
  slug: string;
  created_at: string;
  path?: string;
} | null {
  const sessions = useStore((s) => s.sessions);
  const activePath = useStore((s) => s.activePath);

  return useMemo(() => {
    if (sessionId === null) return null;
    const found = sessions.find((session) => session.id === sessionId);
    return found ?? {
      id: sessionId,
      slug: sessionId.replace(/^\d{4}-\d{2}-\d{2}-/, ""),
      created_at: new Date().toISOString(),
      ...(activePath !== null ? { path: activePath } : {}),
    };
  }, [activePath, sessionId, sessions]);
}
