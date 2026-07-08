import { useMemo } from "react";
import { useStore } from "../../state/store.js";

export interface ActiveFileTreeStoreSnapshot {
  currentSessionId: string | null;
  activePath: string | null;
  activePathId: string | null;
}

export function useActiveFileTreeStore(): ActiveFileTreeStoreSnapshot {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);

  return useMemo(
    () => ({ currentSessionId, activePath, activePathId }),
    [activePath, activePathId, currentSessionId],
  );
}
