/* sources.ts — pure helpers for the Skills palette (P9).
   - groupByAgent: takes a flat SkillRef[] from the backend and groups by
     agent, preserving a deterministic order (claude / codex / gemini /
     generic / other) and alphabetical ordering of names within each group.
   - insertionFor: build the `/<name> <args>` string we feed into the
     compose textarea via store.setComposeDraft. */

import type { SkillRef } from "@f-mark/shared";
import { fuzzyScore } from "../cmdk/fuzzy.js";

/* Deterministic agent order — claude first, codex, gemini, generic last.
   Any unrecognized agent key gets sorted between generic and the end,
   ordered alphabetically. */
const AGENT_ORDER: readonly string[] = [
  "claude",
  "codex",
  "gemini",
  "generic",
];

export interface SkillGroup {
  agent: string;
  label: string;
  skills: SkillRef[];
}

const AGENT_LABEL_OVERRIDES: Record<string, string> = {
  claude: "Claude skills",
  codex: "Codex skills",
  gemini: "Gemini skills",
  generic: "Project skills",
};

function labelFor(agent: string): string {
  const override = AGENT_LABEL_OVERRIDES[agent];
  if (override !== undefined) return override;
  /* Title-case fallback for unknown agents. */
  return `${agent.charAt(0).toUpperCase() + agent.slice(1)} skills`;
}

function agentRank(agent: string): number {
  const idx = AGENT_ORDER.indexOf(agent);
  if (idx >= 0) return idx;
  return AGENT_ORDER.length + 1; /* unknown agents sort last */
}

/* Group skills by their `agent` field. Skills inside each group are sorted
   by `name` ascending (already true for findSkills output, but we re-sort
   defensively in case the API returns a differently-ordered list later). */
export function groupByAgent(skills: SkillRef[]): SkillGroup[] {
  const byAgent = new Map<string, SkillRef[]>();
  for (const s of skills) {
    const list = byAgent.get(s.agent) ?? [];
    list.push(s);
    byAgent.set(s.agent, list);
  }
  const groups: SkillGroup[] = [];
  for (const [agent, list] of byAgent.entries()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ agent, label: labelFor(agent), skills: list });
  }
  groups.sort((a, b) => {
    const ra = agentRank(a.agent);
    const rb = agentRank(b.agent);
    if (ra !== rb) return ra - rb;
    return a.agent.localeCompare(b.agent);
  });
  return groups;
}

/* Filter a skill list by query. We score against the name (fuzzy) and the
   description (literal substring only). Fuzzy-matching against descriptions
   is too lenient — a word like "design" can find itself spelled out across
   scattered characters in any long description, surfacing irrelevant skills.
   Requiring a literal substring for description matches keeps results
   intent-aligned while still letting name typos work via fuzzy. */
export function filterSkills(skills: SkillRef[], query: string): SkillRef[] {
  if (query.length === 0) return skills;
  const q = query.toLowerCase();
  const scored: Array<{ skill: SkillRef; score: number; idx: number }> = [];
  for (let i = 0; i < skills.length; i++) {
    const s = skills[i]!;
    const nameScore = fuzzyScore(query, s.name);
    const descHit = s.description.toLowerCase().includes(q) ? 1 : 0;
    if (nameScore === 0 && descHit === 0) continue;
    const score = nameScore * 3 + descHit * 10;
    scored.push({ skill: s, score, idx: i });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return scored.map((x) => x.skill);
}

/* Build the compose-bar insertion text for a chosen skill. Mirrors the
   prototype:
     /<name> <args>   when skill.args is set (e.g. "/review-pr <pr-url>")
     /<name>          when no args (with a trailing space so the user can
                      keep typing free-form arguments).
   We always include a trailing space so the caret sits ready for the user
   to keep typing. */
export function insertionFor(skill: SkillRef): string {
  if (typeof skill.args === "string" && skill.args.length > 0) {
    return `/${skill.name} ${skill.args}`;
  }
  return `/${skill.name} `;
}

/* Flatten visible groups into a single ordered row list. Used by the modal
   to drive arrow-key navigation across group boundaries. */
export function flattenSkills(groups: SkillGroup[]): SkillRef[] {
  const out: SkillRef[] = [];
  for (const g of groups) for (const s of g.skills) out.push(s);
  return out;
}
