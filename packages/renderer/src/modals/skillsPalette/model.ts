import type { SkillRef } from "@f-mark/shared";
import type { AgentKey } from "../skills/active-agent.js";
import type { SkillGroup } from "../skills/sources.js";
import type { SkillGroupRows } from "./types.js";

const AGENT_BADGE: Record<NonNullable<AgentKey>, string> = {
  claude: "cla",
  codex: "cdx",
  opencode: "opc",
  generic: "any",
};

const TOOL_NAME_HINTS = [
  "review",
  "audit",
  "lint",
  "compile",
  "build",
  "deploy",
] as const;

function badgeForSkill(skill: SkillRef): string {
  if (skill.agent in AGENT_BADGE) {
    return AGENT_BADGE[skill.agent as NonNullable<AgentKey>];
  }
  return skill.agent.slice(0, 3);
}

export function buildSkillGroupRows(groups: SkillGroup[]): SkillGroupRows[] {
  let rowIdx = -1;
  return groups.map((group) => ({
    agent: group.agent,
    label: group.label,
    rows: group.skills.map((skill) => {
      rowIdx += 1;
      return {
        badge: badgeForSkill(skill),
        idx: rowIdx,
        skill,
      };
    }),
  }));
}

export function skillLooksToolLike(skill: SkillRef): boolean {
  const name = skill.name.toLowerCase();
  return TOOL_NAME_HINTS.some((hint) => name.includes(hint));
}
