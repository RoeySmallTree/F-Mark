export interface HookEntry {
  event: string;
  command: string;
  matcher?: string | null;
  version?: string | null;
}

export type HookInstallStatusKind = "installed" | "missing" | "stale" | "blocked";

export interface DetectResult {
  installed: boolean;
  status?: HookInstallStatusKind;
  configPath: string;
  expectedVersion?: string;
  detectedVersion?: string | null;
  detectedEntries: HookEntry[];
  expectedEntries: HookEntry[];
  locations?: HookLocationStatus[];
}

export interface HookLocationStatus {
  scope: "local" | "global";
  configPath: string;
  exists: boolean;
  installed: boolean;
  status?: HookInstallStatusKind;
  expectedVersion?: string;
  detectedVersion?: string | null;
  detectedEntries: HookEntry[];
  expectedEntries: HookEntry[];
  error?: string;
}
