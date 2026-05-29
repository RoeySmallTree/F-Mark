import { spawn } from "child_process";
import type {
  CurrentRuntimeState,
  EffortDescriptor,
  ModelDescriptor,
  RuntimeOverridePatch,
} from "@f-mark/shared";
import { sanitizeArgs as sanitize } from "../argSanitizer.js";
import type { AdapterReadContext, RuntimeAdapter } from "./types.js";

export interface OpencodeCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type OpencodeCliRunner = (args: string[]) => Promise<OpencodeCliResult>;

export interface OpencodeAdapterOptions {
  runCli?: OpencodeCliRunner;
  /* Override the binary name. Defaults to "opencode". */
  binary?: string;
}

function defaultRunCli(binary: string): OpencodeCliRunner {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("close", (code) =>
        resolve({ stdout, stderr, code: code ?? 0 }),
      );
      child.on("error", () =>
        resolve({ stdout, stderr, code: 1 }),
      );
    });
}

interface VerboseEntry {
  id: string;
  json: {
    id?: string;
    providerID?: string;
    name?: string;
    description?: string;
    variants?: Record<string, unknown>;
  };
}

/* Parses the `opencode models --verbose` stdout — interleaved
   "provider/model\n{multi-line JSON}\n" blocks. Brace-balanced, string-aware. */
function parseModelsVerbose(stdout: string): VerboseEntry[] {
  const lines = stdout.split("\n");
  const out: VerboseEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (/^\S+\/\S+$/.test(trimmed)) {
      const id = trimmed;
      let j = i + 1;
      while (j < lines.length && (lines[j] ?? "").trim() === "") j++;
      const first = (lines[j] ?? "").trim();
      if (!first.startsWith("{")) {
        i++;
        continue;
      }
      let depth = 0;
      let inString = false;
      let escape = false;
      const buf: string[] = [];
      let ended = false;
      while (j < lines.length) {
        const ln = lines[j] ?? "";
        buf.push(ln);
        for (const ch of ln) {
          if (escape) {
            escape = false;
            continue;
          }
          if (inString && ch === "\\") {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth === 0) {
          try {
            out.push({ id, json: JSON.parse(buf.join("\n")) });
          } catch {
            // malformed; skip
          }
          i = j + 1;
          ended = true;
          break;
        }
        j++;
      }
      if (!ended) i++;
    } else {
      i++;
    }
  }
  return out;
}

export function createOpencodeAdapter(
  options: OpencodeAdapterOptions = {},
): RuntimeAdapter {
  const runCli = options.runCli ?? defaultRunCli(options.binary ?? "opencode");

  let cachedModels: ModelDescriptor[] | null = null;
  let cacheAt = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000;

  async function loadVerbose(refresh: boolean): Promise<VerboseEntry[]> {
    const args = ["models", "--verbose"];
    if (refresh) args.push("--refresh");
    const result = await runCli(args);
    return parseModelsVerbose(result.stdout);
  }

  function variantsToEfforts(
    variants?: Record<string, unknown>,
  ): EffortDescriptor[] {
    if (!variants) return [];
    return Object.keys(variants).map((id) => ({ id, displayName: id }));
  }

  function toDescriptor(entry: VerboseEntry): ModelDescriptor {
    return {
      id: entry.id,
      displayName: entry.json.name ?? entry.json.id ?? entry.id,
      description: entry.json.description,
      provider: entry.json.providerID,
      efforts: variantsToEfforts(entry.json.variants),
    };
  }

  async function listModels(
    opts: { refresh?: boolean } = {},
  ): Promise<ModelDescriptor[]> {
    if (cachedModels && !opts.refresh && Date.now() - cacheAt < CACHE_TTL_MS) {
      return cachedModels;
    }
    const entries = await loadVerbose(opts.refresh ?? false);
    cachedModels = entries.map(toDescriptor);
    cacheAt = Date.now();
    return cachedModels;
  }

  async function listEfforts(modelId?: string): Promise<EffortDescriptor[]> {
    const models = await listModels();
    if (!modelId) {
      const seen = new Set<string>();
      const out: EffortDescriptor[] = [];
      for (const m of models) {
        for (const e of m.efforts ?? []) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            out.push(e);
          }
        }
      }
      return out;
    }
    const m = models.find((x) => x.id === modelId);
    return m?.efforts ?? [];
  }

  async function readCurrent(
    ctx: AdapterReadContext,
  ): Promise<CurrentRuntimeState | null> {
    if (!ctx.sessionId && !ctx.cwd) return null;
    // Filter `model IS NOT NULL` because the session row is created at
    // session-start with model=NULL and only populated after the first
    // turn. Selecting by cwd alone without this filter routinely
    // picks up an unstarted session and returns null state.
    const query = ctx.sessionId
      ? `SELECT id, model, agent, time_updated FROM session WHERE id = '${escapeSqlString(ctx.sessionId)}' AND model IS NOT NULL LIMIT 1`
      : `SELECT id, model, agent, time_updated FROM session WHERE directory = '${escapeSqlString(ctx.cwd!)}' AND model IS NOT NULL ORDER BY time_updated DESC LIMIT 1`;
    const result = await runCli(["db", "--format", "json", query]);
    if (result.code !== 0) return null;
    let rows: unknown;
    try {
      rows = JSON.parse(result.stdout);
    } catch {
      return null;
    }
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as { model?: unknown };
    if (typeof row.model !== "string") return null;
    let parsed: { id?: unknown; providerID?: unknown; variant?: unknown };
    try {
      parsed = JSON.parse(row.model);
    } catch {
      return null;
    }
    return {
      model: typeof parsed.id === "string" ? parsed.id : undefined,
      effort: typeof parsed.variant === "string" ? parsed.variant : undefined,
      provider:
        typeof parsed.providerID === "string" ? parsed.providerID : undefined,
      source: "opencode-db",
      observedAt: Date.now(),
    };
  }

  function escapeSqlString(s: string): string {
    return s.replace(/'/g, "''");
  }

  function buildSpawnArgs(patch: RuntimeOverridePatch): string[] {
    const out: string[] = [];
    if (patch.model) out.push("-m", patch.model);
    if (patch.effort) out.push("--variant", patch.effort);
    return out;
  }

  function buildSpawnEnv(_patch: RuntimeOverridePatch): Record<string, string> {
    return {};
  }

  function sanitizeArgs(
    existing: string[],
    patch: RuntimeOverridePatch,
  ): string[] {
    return sanitize(existing, "opencode", patch);
  }

  return {
    runtimeId: "opencode",
    listModels,
    listEfforts,
    readCurrent,
    buildSpawnArgs,
    buildSpawnEnv,
    sanitizeArgs,
  };
}
