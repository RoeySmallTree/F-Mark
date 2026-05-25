export interface HookEntry {
  event: string;
  command: string;
}

export interface DetectResult {
  installed: boolean;
  configPath: string;
  detectedEntries: HookEntry[];
  expectedEntries: HookEntry[];
  locations?: HookLocationStatus[];
}

export interface HookLocationStatus {
  scope: "local" | "global";
  configPath: string;
  exists: boolean;
  installed: boolean;
  detectedEntries: HookEntry[];
  expectedEntries: HookEntry[];
  error?: string;
}
