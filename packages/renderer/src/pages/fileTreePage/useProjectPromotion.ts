import { useCallback, useState } from "react";
import type { Client } from "../../api/client.js";
import { useConfirmDestructive } from "../../confirm/index.js";
import { basename } from "./session.js";

export interface ProjectPromotionState {
  promoteBusy: boolean;
  promoteError: string | null;
  makeActiveProject(): Promise<void>;
}

export function useProjectPromotion(
  client: Client,
  activePath: string | null,
): ProjectPromotionState {
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const confirmDestructive = useConfirmDestructive();

  const makeActiveProject = useCallback(async (): Promise<void> => {
    if (activePath === null || promoteBusy) return;
    const intent = await confirmDestructive({
      action: "project.setActive",
      title: `Make "${basename(activePath)}" the active project?`,
      detail: "This switches every open F-Mark tab to this project.",
    });
    if (intent === null) return;
    setPromoteBusy(true);
    setPromoteError(null);
    try {
      await client.setActivePath(activePath);
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromoteBusy(false);
    }
  }, [activePath, promoteBusy, client]);

  return { promoteBusy, promoteError, makeActiveProject };
}
