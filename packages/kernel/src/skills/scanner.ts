import { homedir } from "node:os";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import matter from "gray-matter";
import type { SkillRef } from "@f-mark/shared";

const KNOWN_AGENTS = ["claude", "codex", "opencode", "gemini"] as const;
export type KnownAgent = (typeof KNOWN_AGENTS)[number];
type SkillScope = NonNullable<SkillRef["scope"]>;

interface FoundSkill {
  ref: SkillRef;
  depth: number; // 0 = at cwd, increases going up
  priority: number;
}

export interface FindSkillsOptions {
  includeGlobal?: boolean;
  homeDir?: string;
  pluginCacheDir?: string;
  agentsSkillsDir?: string;
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
  scope: SkillScope,
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
  const heading = firstMarkdownHeading(parsed.content);
  const name = typeof data.name === "string" && data.name.trim().length > 0
    ? data.name
    : (heading ?? fallbackName);
  const description = typeof data.description === "string"
    ? data.description
    : descriptionFromBody(parsed.content);
  const ref: SkillRef = {
    source,
    agent,
    name,
    description,
    path: skillMdPath,
    scope,
    editable: true,
  };
  if (typeof data.args === "string") ref.args = data.args;
  return ref;
}

async function scanSkillsDir(
  dir: string,
  agent: string,
  depth: number,
  scope: SkillScope,
  priority: number,
  nesting = 0,
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
    if (exists) {
      const ref = await parseSkillFile(skillMd, skillDir, agent, entry, scope);
      if (ref !== null) out.push({ ref, depth, priority });
      continue;
    }
    if (nesting < 2) {
      out.push(
        ...(await scanSkillsDir(
          skillDir,
          agent,
          depth,
          scope,
          priority,
          nesting + 1,
        )),
      );
    }
  }
  return out;
}

function isFsRoot(dir: string): boolean {
  return dir === dirname(dir);
}

export async function findSkills(
  cwd: string,
  agent?: string,
  options: FindSkillsOptions = {},
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
      const fromAgent = await scanSkillsDir(agentSkills, a, depth, "project", 0);
      found.push(...fromAgent);
    }
    const genericSkills = join(current, ".skills");
    const fromGeneric = await scanSkillsDir(genericSkills, "generic", depth, "project", 0);
    found.push(...fromGeneric);

    if (isFsRoot(current)) break;
    current = dirname(current);
    depth += 1;
  }
  if (options.includeGlobal === true) {
    found.push(...(await findGlobalSkills(agentsToCheck, options)));
  }

  // Dedup by name; closer-to-cwd wins (smaller depth).
  const byName = new Map<string, FoundSkill>();
  for (const f of found) {
    const existing = byName.get(f.ref.name);
    if (
      existing === undefined ||
      f.priority < existing.priority ||
      (f.priority === existing.priority && f.depth < existing.depth)
    ) {
      byName.set(f.ref.name, f);
    }
  }
  return Array.from(byName.values())
    .map((f) => f.ref)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function findGlobalSkills(
  agentsToCheck: string[],
  options: FindSkillsOptions,
): Promise<FoundSkill[]> {
  const home = options.homeDir ?? homedir();
  const out: FoundSkill[] = [];
  const includesAgent = (key: string): boolean =>
    agentsToCheck.includes(key) || agentsToCheck.length === 0;

  for (const agent of agentsToCheck) {
    out.push(
      ...(await scanSkillsDir(
        join(home, `.${agent}`, "skills"),
        agent,
        10_000,
        "global",
        100,
      )),
    );
  }
  if (includesAgent("codex")) {
    out.push(...(await scanCodexPluginSkills(options)));
  }
  out.push(
    ...(await scanSkillsDir(
      join(home, ".skills"),
      "generic",
      10_000,
      "global",
      100,
    )),
  );
  out.push(
    ...(await scanSkillsDir(
      options.agentsSkillsDir ?? join(home, ".agents", "skills"),
      "generic",
      10_000,
      "global",
      100,
    )),
  );
  return out;
}

async function scanCodexPluginSkills(
  options: FindSkillsOptions,
): Promise<FoundSkill[]> {
  const root = options.pluginCacheDir ??
    join(options.homeDir ?? homedir(), ".codex", "plugins", "cache");
  if (!(await isDirectory(root))) return [];
  const skillDirs = await collectSkillsDirs(root, 0, 6);
  const out: FoundSkill[] = [];
  for (const dir of skillDirs) {
    out.push(...(await scanSkillsDir(dir, "codex", 10_000, "plugin", 110)));
  }
  return out;
}

async function collectSkillsDirs(
  dir: string,
  depth: number,
  maxDepth: number,
): Promise<string[]> {
  if (depth > maxDepth) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const child = join(dir, entry);
    if (!(await isDirectory(child))) continue;
    if (entry === "skills") {
      out.push(child);
      continue;
    }
    out.push(...(await collectSkillsDirs(child, depth + 1, maxDepth)));
  }
  return out;
}

function firstMarkdownHeading(content: string): string | null {
  for (const rawLine of content.split(/\r?\n/)) {
    const match = rawLine.match(/^#\s+(.+)$/);
    if (match?.[1] !== undefined) return match[1].trim();
  }
  return null;
}

function descriptionFromBody(content: string): string {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    return truncate(line.replace(/\s+/g, " "), 180);
  }
  return "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3).trimEnd()}...`;
}
