import type { AnyEventRecord } from "./events.js";

/* Category identifier. Built-in/project presets ship with the conventional
   "generate" | "critique" | "format" keys. Custom (renderer-local) presets
   may use any string id, since users define their own categories. The kernel
   validates its own built-in markdown against the conventional triple; the
   renderer treats it as an opaque string. */
export type PresetGroup = string;

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
  /* Workspaces (absolute paths) where this preset is visible. Empty/absent
     means "visible everywhere". Custom presets carry this via localStorage;
     builtin/project presets currently never set it. */
  workspaces?: string[];
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
