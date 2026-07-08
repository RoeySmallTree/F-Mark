import type { SkillRef } from "@f-mark/shared";
import type { AgentKey } from "../skills/active-agent.js";
import type { SkillGroup } from "../skills/sources.js";

export interface SkillsPaletteController {
  activeAgent: AgentKey;
  error: string | null;
  flatRows: SkillRef[];
  groups: SkillGroup[];
  loading: boolean;
  query: string;
  activate: (skill: SkillRef) => void;
  changeAgent: (agent: AgentKey) => void;
  editSkill: (skill: SkillRef) => void;
  setQuery: (query: string) => void;
}

export interface SkillRowEntry {
  badge: string;
  idx: number;
  skill: SkillRef;
}

export interface SkillGroupRows {
  agent: string;
  label: string;
  rows: SkillRowEntry[];
}
