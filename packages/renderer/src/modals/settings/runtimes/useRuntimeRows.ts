import { useMemo } from "react";
import type { RuntimeEntry } from "@f-mark/shared";
import { buildRuntimeRows, type RuntimeRowModel } from "./model.js";

export function useRuntimeRows(
  runtimes: Record<string, RuntimeEntry>,
): RuntimeRowModel[] {
  return useMemo(() => buildRuntimeRows(runtimes), [runtimes]);
}
