import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";
import type { SkillRef } from "@f-mark/shared";

export const KNOWN_AGENTS = ["claude", "codex", "gemini"] as const;
export type KnownAgent = (typeof KNOWN_AGENTS)[number];

interface FoundSkill {
  ref: SkillRef;
  depth: number; // 0 = at cwd, increases going up
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function parseSkillFile(
  skillMdPath: string,
  source: string,
  agent: string,
  fallbackName: string,
): Promise<SkillRef | null> {
  let raw: string;
  try {
    raw = await readFile(skillMdPath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = matter(raw);
  } catch {
    return null;
  }
  const data = parsed.data as Record<string, unknown>;
  const name = typeof data.name === "string" && data.name.length > 0
    ? data.name
    : fallbackName;
  const description = typeof data.description === "string" ? data.description : "";
  const ref: SkillRef = {
    source,
    agent,
    name,
    description,
    path: skillMdPath,
  };
  if (typeof data.args === "string") ref.args = data.args;
  return ref;
}

async function scanSkillsDir(
  dir: string,
  agent: string,
  depth: number,
): Promise<FoundSkill[]> {
  if (!(await isDirectory(dir))) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: FoundSkill[] = [];
  for (const entry of entries) {
    const skillDir = join(dir, entry);
    if (!(await isDirectory(skillDir))) continue;
    const skillMd = join(skillDir, "SKILL.md");
    let exists = false;
    try {
      const s = await stat(skillMd);
      exists = s.isFile();
    } catch {
      exists = false;
    }
    if (!exists) continue;
    const ref = await parseSkillFile(skillMd, skillDir, agent, entry);
    if (ref === null) continue;
    out.push({ ref, depth });
  }
  return out;
}

function isFsRoot(dir: string): boolean {
  return dir === dirname(dir);
}

export async function findSkills(
  cwd: string,
  agent?: string,
): Promise<SkillRef[]> {
  const agentsToCheck: string[] = agent === undefined
    ? [...KNOWN_AGENTS]
    : [agent];

  const found: FoundSkill[] = [];
  let current = resolve(cwd);
  let depth = 0;
  // Walk upward to filesystem root
  while (true) {
    for (const a of agentsToCheck) {
      const agentSkills = join(current, `.${a}`, "skills");
      const fromAgent = await scanSkillsDir(agentSkills, a, depth);
      found.push(...fromAgent);
    }
    const genericSkills = join(current, ".skills");
    const fromGeneric = await scanSkillsDir(genericSkills, "generic", depth);
    found.push(...fromGeneric);

    if (isFsRoot(current)) break;
    current = dirname(current);
    depth += 1;
  }

  // Dedup by name; closer-to-cwd wins (smaller depth).
  const byName = new Map<string, FoundSkill>();
  for (const f of found) {
    const existing = byName.get(f.ref.name);
    if (existing === undefined || f.depth < existing.depth) {
      byName.set(f.ref.name, f);
    }
  }
  return Array.from(byName.values())
    .map((f) => f.ref)
    .sort((a, b) => a.name.localeCompare(b.name));
}
