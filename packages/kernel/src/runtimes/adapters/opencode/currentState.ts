import type { CurrentRuntimeState } from "@f-mark/shared";
import type { AdapterReadContext } from "../types.js";
import type { OpencodeCliRunner } from "./types.js";

interface OpencodeModelColumn {
  id?: unknown;
  providerID?: unknown;
  variant?: unknown;
}

export function createOpencodeCurrentStateReader(runCli: OpencodeCliRunner) {
  async function readCurrent(
    ctx: AdapterReadContext,
  ): Promise<CurrentRuntimeState | null> {
    const query = runtimeStateQuery(ctx);
    if (query === null) return null;

    const result = await runCli(["db", "--format", "json", query]);
    if (result.code !== 0) return null;

    return stateFromRows(parseRows(result.stdout));
  }

  return { readCurrent };
}

function runtimeStateQuery(ctx: AdapterReadContext): string | null {
  if (ctx.sessionId) return sessionRuntimeStateQuery(ctx.sessionId);
  if (ctx.cwd) return cwdRuntimeStateQuery(ctx.cwd);
  return null;
}

function sessionRuntimeStateQuery(sessionId: string): string {
  return (
    "SELECT id, model, agent, time_updated FROM session " +
    `WHERE id = '${escapeSqlString(sessionId)}' AND model IS NOT NULL LIMIT 1`
  );
}

function cwdRuntimeStateQuery(cwd: string): string {
  return (
    "SELECT id, model, agent, time_updated FROM session " +
    `WHERE directory = '${escapeSqlString(cwd)}' AND model IS NOT NULL ` +
    "ORDER BY time_updated DESC LIMIT 1"
  );
}

function parseRows(stdout: string): unknown[] | null {
  try {
    const rows = JSON.parse(stdout);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function stateFromRows(rows: unknown[] | null): CurrentRuntimeState | null {
  const first = rows?.[0] as { model?: unknown } | undefined;
  if (typeof first?.model !== "string") return null;

  const parsed = parseModelColumn(first.model);
  if (parsed === null) return null;

  return {
    model: stringField(parsed.id),
    effort: stringField(parsed.variant),
    provider: stringField(parsed.providerID),
    source: "opencode-db",
    observedAt: Date.now(),
  };
}

function parseModelColumn(model: string): OpencodeModelColumn | null {
  try {
    return JSON.parse(model) as OpencodeModelColumn;
  } catch {
    return null;
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
