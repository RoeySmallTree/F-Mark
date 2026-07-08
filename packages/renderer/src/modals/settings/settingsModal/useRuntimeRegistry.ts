import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RuntimeEntry, RuntimesFile } from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../../api/managedAgents.js";

type RuntimeRegistry = Record<string, RuntimeEntry> | null;
export type SetRuntimeRegistry = Dispatch<SetStateAction<RuntimeRegistry>>;

interface RuntimeRegistryState {
  runtimeRegistry: RuntimeRegistry;
  setRuntimeRegistry: SetRuntimeRegistry;
}

export function useRuntimeRegistry(
  apiClient: ManagedAgentsClient,
): RuntimeRegistryState {
  const [runtimeRegistry, setRuntimeRegistry] =
    useState<RuntimeRegistry>(null);

  useEffect(() => {
    let alive = true;
    void apiClient
      .listRuntimes()
      .then((cfg) => {
        if (alive) setRuntimeRegistry(readRuntimeRegistry(cfg));
      })
      .catch(() => {
        if (alive) setRuntimeRegistry(null);
      });
    return () => {
      alive = false;
    };
  }, [apiClient]);

  return { runtimeRegistry, setRuntimeRegistry };
}

function readRuntimeRegistry(cfg: RuntimesFile): Record<string, RuntimeEntry> {
  if (
    cfg.runtimes === undefined ||
    cfg.runtimes === null ||
    typeof cfg.runtimes !== "object"
  ) {
    throw new Error("GET /runtimes returned no runtimes object");
  }
  return cfg.runtimes;
}
