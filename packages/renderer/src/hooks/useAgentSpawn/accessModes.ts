import { useCallback, useState } from "react";
import type { RuntimeAccessModeOption } from "@f-mark/shared";
import {
  defaultRuntimeAccessMode,
  isRuntimeAccessMode,
  runtimeAccessModeOptions,
} from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  default: "default",
} as const;

interface AgentAccessModes {
  accessModeForRuntime(runtimeId: string): string;
  accessModeOptionsForRuntime(runtimeId: string): RuntimeAccessModeOption[];
  setAccessModeForRuntime(runtimeId: string, mode: string): void;
}

function normalizeAccessMode(runtimeId: string, mode: string): string {
  if (mode === NO_LOOSE_STRING_VALUES.default) return mode;
  if (isRuntimeAccessMode(runtimeId, mode)) return mode;
  return defaultRuntimeAccessMode(runtimeId);
}

export function useAgentAccessModes(
  defaultAccessModeForRuntime: (runtimeId: string) => string | null,
): AgentAccessModes {
  const [accessModesByRuntime, setAccessModesByRuntime] = useState<
    Record<string, string>
  >({});

  const accessModeForRuntime = useCallback(
    (runtimeId: string): string => {
      const fallback = defaultRuntimeAccessMode(runtimeId);
      return normalizeAccessMode(
        runtimeId,
        accessModesByRuntime[runtimeId] ??
          defaultAccessModeForRuntime(runtimeId) ??
          fallback,
      );
    },
    [accessModesByRuntime, defaultAccessModeForRuntime],
  );

  const accessModeOptionsForRuntime = useCallback(
    (runtimeId: string): RuntimeAccessModeOption[] =>
      runtimeAccessModeOptions(runtimeId),
    [],
  );

  const setAccessModeForRuntime = useCallback(
    (runtimeId: string, mode: string): void => {
      const normalized = normalizeAccessMode(runtimeId, mode);
      setAccessModesByRuntime((prev) => ({
        ...prev,
        [runtimeId]: normalized,
      }));
    },
    [],
  );

  return {
    accessModeForRuntime,
    accessModeOptionsForRuntime,
    setAccessModeForRuntime,
  };
}
