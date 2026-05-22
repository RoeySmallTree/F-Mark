import type { AnyEventRecord } from "./events.js";

export type PresetGroup = "generate" | "critique" | "format";

export interface Preset {
  name: string;
  group: PresetGroup;
  icon?: string;
  body: string;
  source: "builtin" | "project";
  path: string;
}

export interface SkillRef {
  source: string;
  agent: string;
  name: string;
  description: string;
  args?: string;
  path: string;
}

export interface SearchHit {
  session_id: string;
  event: AnyEventRecord;
  snippet: string;
}
