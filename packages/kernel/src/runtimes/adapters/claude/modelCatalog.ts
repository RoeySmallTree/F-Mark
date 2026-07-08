import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";
import type { ClaudeCliRunner } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

/* Used only when the Claude binary cannot be queried in tests or stripped-down
   environments. The normal path reads the installed provider CLI every time the
   cache is empty or explicitly refreshed. */
const FALLBACK_CLAUDE_HELP = `
  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name (e.g.
                                        'claude-fable-5').
`;

export interface ClaudeModelCatalog {
  listModels(opts?: { refresh?: boolean }): Promise<ModelDescriptor[]>;
  listEfforts(modelId?: string): Promise<EffortDescriptor[]>;
}

interface ClaudeCatalogSnapshot {
  models: ModelDescriptor[];
  efforts: EffortDescriptor[];
}

export function createClaudeModelCatalog(
  runCli: ClaudeCliRunner,
): ClaudeModelCatalog {
  let cachedSnapshot: ClaudeCatalogSnapshot | null = null;
  let cacheAt = 0;

  async function loadCatalog(
    opts: { refresh?: boolean } = {},
  ): Promise<ClaudeCatalogSnapshot> {
    if (
      cachedSnapshot &&
      !opts.refresh &&
      Date.now() - cacheAt < CACHE_TTL_MS
    ) {
      return cachedSnapshot;
    }

    const help = await loadHelp(runCli);
    cachedSnapshot = parseClaudeCatalogHelp(help);
    cacheAt = Date.now();
    return cachedSnapshot;
  }

  async function listModels(
    opts: { refresh?: boolean } = {},
  ): Promise<ModelDescriptor[]> {
    return (await loadCatalog(opts)).models;
  }

  async function listEfforts(_modelId?: string): Promise<EffortDescriptor[]> {
    return (await loadCatalog()).efforts;
  }

  return { listModels, listEfforts };
}

export function parseClaudeCatalogHelp(help: string): ClaudeCatalogSnapshot {
  const efforts = parseEfforts(help);
  const models = parseModelIds(help).map((id) => ({
    id,
    displayName: displayNameForModel(id),
    description: "Advertised by claude --help.",
    efforts,
  }));
  return { models, efforts };
}

async function loadHelp(runCli: ClaudeCliRunner): Promise<string> {
  const result = await runCli(["--help"]);
  if (result.code === 0 && result.stdout.trim().length > 0) {
    return result.stdout;
  }
  return FALLBACK_CLAUDE_HELP;
}

function parseModelIds(help: string): string[] {
  const block = optionBlock(help, "model");
  const quoted = quotedValues(block).filter(isModelLike);
  return unique(quoted);
}

function parseEfforts(help: string): EffortDescriptor[] {
  const block = optionBlock(help, "effort");
  const match = block.match(/\(([^()]+)\)/);
  const raw = match?.[1] ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(isOptionToken)
    .map((id) => ({
      id,
      displayName: displayNameForEffort(id),
    }));
}

function optionBlock(help: string, option: string): string {
  const lines = help.split("\n");
  const start = lines.findIndex((line) => line.includes(`--${option}`));
  if (start < 0) return "";

  const out: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (index > start && isOptionStart(line)) break;
    out.push(line.trim());
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

function isOptionStart(line: string): boolean {
  return /^\s{2}(?:-\w,\s*)?--[a-z0-9-]+/i.test(line);
}

function quotedValues(text: string): string[] {
  return Array.from(
    text.matchAll(/(^|[\s(])'([^']+)'/g),
    (match) => match[2] ?? "",
  );
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isModelLike(value: string): boolean {
  return /^[a-z0-9][a-z0-9._/-]*$/i.test(value);
}

function isOptionToken(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/i.test(value);
}

function displayNameForModel(id: string): string {
  const match = id.match(/^claude-([a-z0-9]+)-(\d+)(?:-(\d+))?/i);
  if (match) {
    const [, family, major, minor] = match;
    return `${titleCase(family!)} ${minor ? `${major}.${minor}` : major}`;
  }
  if (!id.includes("/") && !id.includes("-")) return titleCase(id);
  return id;
}

function displayNameForEffort(id: string): string {
  if (id === "xhigh") return "X-high";
  return titleCase(id);
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
