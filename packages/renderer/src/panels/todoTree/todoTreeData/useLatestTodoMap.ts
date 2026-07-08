import type { AnyEventRecord } from "@f-mark/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { latestTodoFilenames } from "../../todoPanelUtils.js";
import type { RememberLatestTodoFilename } from "./types.js";

type LatestTodoOverrides = Record<string, string>;

interface LatestTodoMapController {
  latestById: Map<string, string>;
  rememberLatest: RememberLatestTodoFilename;
}

interface UseLatestTodoMapArgs {
  events: AnyEventRecord[];
  sessionId: string | null;
}

function latestTodoMapWithOverrides(
  events: AnyEventRecord[],
  overrides: LatestTodoOverrides,
): Map<string, string> {
  const latest = latestTodoFilenames(events);
  for (const [id, filename] of Object.entries(overrides)) {
    latest.set(id, filename);
  }
  return latest;
}

export function useLatestTodoMap({
  events,
  sessionId,
}: UseLatestTodoMapArgs): LatestTodoMapController {
  const [latestOverrides, setLatestOverrides] = useState<LatestTodoOverrides>(
    {},
  );

  useEffect(() => {
    setLatestOverrides({});
  }, [sessionId]);

  const rememberLatest = useCallback(
    (id: string, filename: string): void => {
      setLatestOverrides((current) => ({ ...current, [id]: filename }));
    },
    [],
  );

  const latestById = useMemo(
    () => latestTodoMapWithOverrides(events, latestOverrides),
    [events, latestOverrides],
  );

  return { latestById, rememberLatest };
}
