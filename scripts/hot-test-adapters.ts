/* Hot-test the runtime adapters against ACTUAL local sessions.
   Run with: pnpm tsx scripts/hot-test-adapters.ts */

import { createCodexAdapter } from "../packages/kernel/src/runtimes/adapters/codex.js";
import { createClaudeAdapter } from "../packages/kernel/src/runtimes/adapters/claude.js";
import { createOpencodeAdapter } from "../packages/kernel/src/runtimes/adapters/opencode.js";
import { spawnSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function header(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

function latestFile(dir: string, suffix = ".jsonl"): string | null {
  const all: { path: string; mtime: number }[] = [];
  function walk(d: string, depth = 0): void {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name.endsWith(suffix)) {
        try {
          const s = statSync(full);
          all.push({ path: full, mtime: s.mtimeMs });
        } catch {
          // skip
        }
      }
    }
  }
  walk(dir);
  all.sort((a, b) => b.mtime - a.mtime);
  return all[0]?.path ?? null;
}

async function testCodex(): Promise<void> {
  header("CODEX adapter — live rollout");
  const adapter = createCodexAdapter();
  const sessionsRoot = join(homedir(), ".codex", "sessions");
  const rollout = latestFile(sessionsRoot);
  console.log(`latest rollout: ${rollout}`);
  if (!rollout) {
    console.log("✗ no rollouts found — skipping");
    return;
  }

  // 1) listModels
  const models = await adapter.listModels();
  console.log(`listModels → ${models.length} models: ${models.map((m) => m.id).join(", ")}`);

  // 2) readCurrent with transcriptPath
  const stateA = await adapter.readCurrent({ transcriptPath: rollout });
  console.log(`readCurrent({transcriptPath}) →`, stateA);

  // 3) readCurrent with cwd fallback (no transcriptPath)
  // pick a cwd we know exists in some rollout
  const cwd = "/home/roey/workspace/F-Mark";
  const stateB = await adapter.readCurrent({ cwd });
  console.log(`readCurrent({cwd:"${cwd}"}) →`, stateB);
}

async function testClaude(): Promise<void> {
  header("CLAUDE adapter — live transcript");
  const adapter = createClaudeAdapter();
  const claudeProjectsRoot = join(homedir(), ".claude", "projects");
  // Find a recent transcript for any project
  const latest = latestFile(claudeProjectsRoot);
  console.log(`latest transcript: ${latest}`);
  if (!latest) {
    console.log("✗ no transcripts found — skipping");
    return;
  }

  const models = await adapter.listModels();
  console.log(`listModels → ${models.map((m) => m.id).join(", ")}`);

  const efforts = await adapter.listEfforts();
  console.log(`listEfforts → ${efforts.map((e) => e.id).join(", ")}`);

  const state = await adapter.readCurrent({ transcriptPath: latest });
  console.log(`readCurrent({transcriptPath}) →`, state);
}

async function testOpencode(): Promise<void> {
  header("OPENCODE adapter — live db");
  const adapter = createOpencodeAdapter();

  // listModels (cached) — does it actually run the CLI?
  const models = await adapter.listModels();
  console.log(`listModels → ${models.length} models (first 5: ${models.slice(0, 5).map((m) => m.id).join(", ")})`);

  // Sample efforts for a known model
  const sampleModel = models.find((m) => m.id === "openai/gpt-5.5") ?? models[0];
  if (sampleModel) {
    const efforts = await adapter.listEfforts(sampleModel.id);
    console.log(`listEfforts(${sampleModel.id}) → ${efforts.map((e) => e.id).join(", ")}`);
  }

  // Find latest session ID via opencode db
  const dbRes = spawnSync(
    "opencode",
    ["db", "--format", "json", "SELECT id FROM session ORDER BY time_updated DESC LIMIT 1"],
    { encoding: "utf8" },
  );
  if (dbRes.status !== 0) {
    console.log("✗ opencode db query failed:", dbRes.stderr);
    return;
  }
  const rows = JSON.parse(dbRes.stdout) as Array<{ id: string }>;
  const sessionId = rows[0]?.id;
  console.log(`sample sessionId: ${sessionId}`);
  if (!sessionId) {
    console.log("✗ no opencode sessions found — skipping readCurrent");
    return;
  }

  const stateA = await adapter.readCurrent({ sessionId });
  console.log(`readCurrent({sessionId}) →`, stateA);

  const stateB = await adapter.readCurrent({ cwd: "/home/roey/workspace/F-Mark" });
  console.log(`readCurrent({cwd}) →`, stateB);
}

async function main(): Promise<void> {
  await testCodex();
  await testClaude();
  await testOpencode();
  console.log("\nAll hot-tests completed.");
}

main().catch((err) => {
  console.error("Hot-test failed:", err);
  process.exit(1);
});
