export interface HookEntry {
  event: string;
  command: string;
}

export interface DetectResult {
  installed: boolean;
  configPath: string;
  detectedEntries: HookEntry[];
  expectedEntries: HookEntry[];
}
