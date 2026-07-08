import { useMemo } from "react";
import type { EnvProbeResult, RuntimeEntry } from "@f-mark/shared";
import {
  createManagedAgentsClient,
  type ManagedAgentsClient,
} from "../../../api/managedAgents.js";
import { useStore, type SettingsSectionKey } from "../../../state/store.js";
import {
  SETTINGS_SECTIONS,
  buildSettingsRuntimes,
  type SettingsSectionDef,
} from "./model.js";
import { useRuntimeActions } from "./useRuntimeActions.js";
import { useRuntimeRegistry } from "./useRuntimeRegistry.js";

export interface SettingsModalController {
  sections: readonly SettingsSectionDef[];
  section: SettingsSectionKey;
  setSection(section: SettingsSectionKey): void;
  closeModal(): void;
  runtimes: Record<string, RuntimeEntry>;
  envProbe: EnvProbeResult | null;
  apiClient: ManagedAgentsClient;
  handleReprobe(): Promise<void>;
  handleAddRuntime(id: string, entry: RuntimeEntry): Promise<void>;
  handleUpdateRuntime(id: string, entry: RuntimeEntry): Promise<void>;
  handleRemoveRuntime(id: string): Promise<void>;
}

export function useSettingsModalController(): SettingsModalController {
  const closeModal = useStore((state) => state.closeModal);
  const token = useStore((state) => state.token);
  const envProbe = useStore((state) => state.envProbe);
  const setEnvProbe = useStore((state) => state.setEnvProbe);
  const section = useStore((state) => state.settingsSection);
  const setSection = useStore((state) => state.setSettingsSection);

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const { runtimeRegistry, setRuntimeRegistry } =
    useRuntimeRegistry(apiClient);
  const runtimeActions = useRuntimeActions({
    apiClient,
    setEnvProbe,
    setRuntimeRegistry,
  });

  const runtimes = useMemo(
    () => buildSettingsRuntimes({ runtimeRegistry, envProbe }),
    [envProbe, runtimeRegistry],
  );

  return {
    sections: SETTINGS_SECTIONS,
    section,
    setSection,
    closeModal,
    runtimes,
    envProbe,
    apiClient,
    ...runtimeActions,
  };
}
