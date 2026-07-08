import { useCallback, useState } from "react";
import { createClient } from "../api/client.js";

const NO_LOOSE_STRING_VALUES = {
  idle: "idle",
  restarting: "restarting",
  ready: "ready",
  error: "error",
} as const;

export type KernelRestartState = "idle" | "restarting" | "ready" | "error";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForKernelRestart(input: {
  token: string | null;
}): Promise<void> {
  const startedAt = Date.now();
  const deadline = Date.now() + 12_000;
  let sawOutage = false;
  while (Date.now() < deadline) {
    await wait(350);
    try {
      await createClient({ baseUrl: "", token: input.token }).health();
      if (sawOutage || Date.now() - startedAt > 1_200) return;
    } catch {
      sawOutage = true;
    }
  }
}

export interface KernelRestartController {
  devKernelRestartEnabled: boolean;
  kernelRestartState: KernelRestartState;
  setDevKernelRestartEnabled(enabled: boolean): void;
  restartKernel(): void;
}

export function useKernelRestart(token: string | null): KernelRestartController {
  const [devKernelRestartEnabled, setDevKernelRestartEnabled] = useState(false);
  const [kernelRestartState, setKernelRestartState] =
    useState<KernelRestartState>(NO_LOOSE_STRING_VALUES.idle);

  const restartKernel = useCallback((): void => {
    if (!devKernelRestartEnabled || kernelRestartState === NO_LOOSE_STRING_VALUES.restarting) return;
    const client = createClient({ baseUrl: "", token });
    setKernelRestartState(NO_LOOSE_STRING_VALUES.restarting);
    void (async () => {
      try {
        await client.restartKernel();
        await waitForKernelRestart({ token });
        setKernelRestartState(NO_LOOSE_STRING_VALUES.ready);
        window.setTimeout(() => setKernelRestartState(NO_LOOSE_STRING_VALUES.idle), 1800);
      } catch {
        setKernelRestartState(NO_LOOSE_STRING_VALUES.error);
        window.setTimeout(() => setKernelRestartState(NO_LOOSE_STRING_VALUES.idle), 3000);
      }
    })();
  }, [devKernelRestartEnabled, kernelRestartState, token]);

  return {
    devKernelRestartEnabled,
    kernelRestartState,
    setDevKernelRestartEnabled,
    restartKernel,
  };
}
