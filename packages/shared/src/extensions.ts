import type { AnyEventRecord } from "./events.js";

export type PresetGroup = "generate" | "critique" | "format";

export interface Preset {
  name: string;
  group: PresetGroup;
  icon?: string;
  body: string;
  source: "builtin" | "project" | "custom";
  /* For builtin/project this is the file path on disk; for `custom`
     (renderer-local, stored in localStorage) it's a stable client-generated
     id so the popover and editor can identify a single entry. */
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
  session_slug?: string;
  path?: string;
  path_id?: string;
  event: AnyEventRecord;
  snippet: string;
}
