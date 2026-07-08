import { useCallback, useState } from "react";
import type { BusyAction, BusyState } from "../types.js";
import { errorMessage } from "./errorMessage.js";

interface UseBusyRunnerParams {
  refresh(): Promise<void>;
  setError(message: string | null): void;
}

export function useBusyRunner({ refresh, setError }: UseBusyRunnerParams) {
  const [busy, setBusy] = useState<BusyState | null>(null);

  const run = useCallback(
    async (
      id: string,
      action: BusyAction,
      fn: () => Promise<unknown>,
    ): Promise<void> => {
      setBusy({ id, action });
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [refresh, setError],
  );

  return { busy, run };
}
