import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";

interface RuntimeCatalogEntry {
  models: ModelDescriptor[];
  efforts: EffortDescriptor[];
  defaultModel: string;
  defaultEffort: string;
  defaultAccessMode: string | null;
  model: string;
  effort: string;
  modelsLoaded: boolean;
  effortsModel: string | null;
}

export interface AgentRuntimeCatalog {
  catalogByRuntime: Record<string, RuntimeCatalogEntry>;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
  modelOptionsForRuntime(runtimeId: string): ModelDescriptor[];
  effortOptionsForRuntime(runtimeId: string): EffortDescriptor[];
  defaultAccessModeForRuntime(runtimeId: string): string | null;
  setModelForRuntime(runtimeId: string, model: string): void;
  setEffortForRuntime(runtimeId: string, effort: string): void;
}

const EMPTY_ENTRY: RuntimeCatalogEntry = {
  models: [],
  efforts: [],
  defaultModel: "",
  defaultEffort: "",
  defaultAccessMode: null,
  model: "",
  effort: "",
  modelsLoaded: false,
  effortsModel: null,
};

function entryOrEmpty(
  catalogByRuntime: Record<string, RuntimeCatalogEntry>,
  runtimeId: string,
): RuntimeCatalogEntry {
  return catalogByRuntime[runtimeId] ?? EMPTY_ENTRY;
}

function updateEntry(
  prev: Record<string, RuntimeCatalogEntry>,
  runtimeId: string,
  patch: Partial<RuntimeCatalogEntry>,
): Record<string, RuntimeCatalogEntry> {
  return {
    ...prev,
    [runtimeId]: {
      ...EMPTY_ENTRY,
      ...prev[runtimeId],
      ...patch,
    },
  };
}

export function useAgentRuntimeCatalog(
  apiClient: ManagedAgentsClient,
  runtimeIds: string[],
): AgentRuntimeCatalog {
  const [catalogByRuntime, setCatalogByRuntime] = useState<
    Record<string, RuntimeCatalogEntry>
  >({});
  const loadingModels = useRef(new Set<string>());
  const loadingEfforts = useRef(new Set<string>());
  const runtimeIdsKey = runtimeIds.join("\0");

  const loadModels = useCallback(
    (runtimeId: string): void => {
      const current = catalogByRuntime[runtimeId];
      if (current?.modelsLoaded === true) return;
      if (loadingModels.current.has(runtimeId)) return;
      loadingModels.current.add(runtimeId);
      setCatalogByRuntime((prev) =>
        updateEntry(prev, runtimeId, { modelsLoaded: false }),
      );
      void apiClient
        .runtimeCatalogModels(runtimeId)
        .then((response) => {
          setCatalogByRuntime((prev) => {
            const existing = prev[runtimeId] ?? EMPTY_ENTRY;
            const model = existing.model || response.default_model || "";
            const effort = existing.effort || response.default_effort || "";
            return updateEntry(prev, runtimeId, {
              models: response.models,
              defaultModel: response.default_model ?? "",
              defaultEffort: response.default_effort ?? "",
              defaultAccessMode: response.default_access_mode ?? null,
              model,
              effort,
              modelsLoaded: true,
            });
          });
        })
        .catch(() => {
          setCatalogByRuntime((prev) =>
            updateEntry(prev, runtimeId, { modelsLoaded: true }),
          );
        })
        .finally(() => {
          loadingModels.current.delete(runtimeId);
        });
    },
    [apiClient, catalogByRuntime],
  );

  const loadEfforts = useCallback(
    (runtimeId: string, model: string): void => {
      const key = `${runtimeId}\0${model}`;
      if (loadingEfforts.current.has(key)) return;
      loadingEfforts.current.add(key);
      void apiClient
        .runtimeCatalogEfforts(runtimeId, model)
        .then((efforts) => {
          setCatalogByRuntime((prev) => {
            const existing = prev[runtimeId] ?? EMPTY_ENTRY;
            if (existing.model !== model) return prev;
            return updateEntry(prev, runtimeId, {
              efforts,
              effortsModel: model,
            });
          });
        })
        .catch(() => {
          setCatalogByRuntime((prev) =>
            updateEntry(prev, runtimeId, { effortsModel: model }),
          );
        })
        .finally(() => {
          loadingEfforts.current.delete(key);
        });
    },
    [apiClient],
  );

  useEffect(() => {
    for (const runtimeId of runtimeIdsKey.split("\0")) {
      if (runtimeId.length > 0) loadModels(runtimeId);
    }
  }, [loadModels, runtimeIdsKey]);

  useEffect(() => {
    for (const [runtimeId, entry] of Object.entries(catalogByRuntime)) {
      if (!entry.modelsLoaded) continue;
      if (entry.effortsModel === entry.model) continue;
      loadEfforts(runtimeId, entry.model);
    }
  }, [catalogByRuntime, loadEfforts]);

  const modelForRuntime = useCallback(
    (runtimeId: string): string =>
      entryOrEmpty(catalogByRuntime, runtimeId).model,
    [catalogByRuntime],
  );

  const effortForRuntime = useCallback(
    (runtimeId: string): string =>
      entryOrEmpty(catalogByRuntime, runtimeId).effort,
    [catalogByRuntime],
  );

  const modelOptionsForRuntime = useCallback(
    (runtimeId: string): ModelDescriptor[] =>
      entryOrEmpty(catalogByRuntime, runtimeId).models,
    [catalogByRuntime],
  );

  const effortOptionsForRuntime = useCallback(
    (runtimeId: string): EffortDescriptor[] =>
      entryOrEmpty(catalogByRuntime, runtimeId).efforts,
    [catalogByRuntime],
  );

  const defaultAccessModeForRuntime = useCallback(
    (runtimeId: string): string | null =>
      entryOrEmpty(catalogByRuntime, runtimeId).defaultAccessMode,
    [catalogByRuntime],
  );

  const setModelForRuntime = useCallback(
    (runtimeId: string, model: string): void => {
      setCatalogByRuntime((prev) =>
        updateEntry(prev, runtimeId, {
          model,
          efforts: [],
          effortsModel: null,
        }),
      );
    },
    [],
  );

  const setEffortForRuntime = useCallback(
    (runtimeId: string, effort: string): void => {
      setCatalogByRuntime((prev) => updateEntry(prev, runtimeId, { effort }));
    },
    [],
  );

  return {
    catalogByRuntime,
    modelForRuntime,
    effortForRuntime,
    modelOptionsForRuntime,
    effortOptionsForRuntime,
    defaultAccessModeForRuntime,
    setModelForRuntime,
    setEffortForRuntime,
  };
}
