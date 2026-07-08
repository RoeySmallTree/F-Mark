/**
 * LIVE reproduction harness for planning/hook-injected-activity/.
 *
 * Boots a REAL kernel (createServer + app.listen on an ephemeral port), points
 * a REAL .f-mark/{.token,config.json} at it, and drives the REAL auto-stream
 * hook CLI over real fetch+HTTP+disk — exactly as Codex invokes it. No fetch
 * stubbing, no tmux. Proves Section A (injected prompt persisted as a us-*
 * source:hook prose) and Section C (post-turn PostToolUse reopens a closed
 * turn) at the event-stream level, which is where the fixes operate.
 *
 * Run: (in packages/kernel)  npx vitest run tests/hooks/hookInjectedActivity.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createServer } from "../../src/server.js";
import { initProject, readConfig, writeConfig } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { runAutoStream } from "../../src/hooks/autoStream.js";

interface Booted {
  root: string;
  sessionId: string;
  userId: string;
  agentId: string;
  port: number;
  inject: (method: string, url: string, payload?: unknown) => Promise<any>;
  env: NodeJS.ProcessEnv;
  sessionDir: () => Promise<string>;
  listEvents: () => Promise<string[]>;
  readEvent: (filename: string) => Promise<string>;
  close: () => Promise<void>;
}

async function boot(): Promise<Booted> {
  const root = await mkdtemp(join(tmpdir(), "fm-live-"));
  const p = paths(root);
  await initProject(p);
  const { app } = createServer({ token: null, paths: p });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address() as { port: number };
  const port = addr.port;

  // Point hooks at THIS kernel.
  const cfg = await readConfig(p);
  await writeConfig(p, { ...cfg, host: "127.0.0.1", port });
  await writeFile(join(root, ".f-mark", ".token"), "tok-live", "utf8");

  const inject = async (method: string, url: string, payload?: unknown) => {
    const res = await app.inject({ method: method as any, url, payload: payload as any });
    return { status: res.statusCode, json: () => JSON.parse(res.body || "{}"), body: res.body };
  };

  const created = (await inject("POST", "/sessions", { slug: "live" })).json();
  const sessionId = created.id as string;
  const participants = (await inject("GET", "/participants")).json();
  const userId = Object.keys(participants.participants)[0]!;
  const agent = (
    await inject("POST", "/participants/register", {
      kind: "agent",
      name: "Codex",
      suggested_id: "ag-codex-live",
    })
  ).json();
  const agentId = agent.id as string;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    F_MARK_PATH: root,
    F_MARK_AGENT_ID: agentId,
    F_MARK_USER_ID: userId,
    F_MARK_SESSION_ID: sessionId,
  };

  const sessionDir = async () => join(root, ".f-mark", "sessions", sessionId);
  const listEvents = async () => (await readdir(await sessionDir())).sort();
  const readEvent = async (filename: string) => readFile(join(await sessionDir(), filename), "utf8");

  return {
    root, sessionId, userId, agentId, port, inject, env,
    sessionDir, listEvents, readEvent,
    close: async () => { await app.close(); },
  };
}

const log = (...a: unknown[]) => console.log("[live]", ...a);

describe("hook-injected activity — LIVE repro (before fix)", () => {
  it("Section A: an injected UserPromptSubmit is persisted as a us-* prose with source:hook", async () => {
    const b = await boot();
    try {
      log("session", b.sessionId, "user", b.userId, "agent", b.agentId, "port", b.port);

      // Baseline: a genuine human composer message (REST postProse, no source field).
      await b.inject("POST", `/sessions/${b.sessionId}/events/prose`, {
        root: b.root, participant_id: b.userId, content: "proceed",
      });

      // Leak: Codex injects a memory-consolidation prompt → UserPromptSubmit hook.
      const injected = "## Memory Writing Agent: Phase 2 (Consolidation)\n\nYou are a Memory Writing Agent.";
      const exit = await runAutoStream(
        b.userId, "user",
        JSON.stringify({ cwd: b.root, hook_event_name: "UserPromptSubmit", prompt: injected }),
        { env: b.env },
      );
      log("user-hook exit", exit);

      const events = await b.listEvents();
      const userProse = events.filter((f) => f.includes(`_${b.userId}.prose.md`));
      log("us-* prose files:", userProse);

      const withSource: string[] = [];
      const clean: string[] = [];
      for (const f of userProse) {
        const head = (await b.readEvent(f)).slice(0, 60);
        (head.includes("source: hook") ? withSource : clean).push(`${f} :: ${JSON.stringify(head)}`);
      }
      log("CLEAN human prose (no source):", clean);
      log("SOURCE:HOOK user prose (should be NONE after deep fix):", withSource);

      const all = await b.listEvents();
      const subRun = all.filter((f) => f.includes(".subagent-run.json"));
      const subOut = all.filter((f) => f.includes(".subagent-output.json"));
      const runBody = subRun.length ? JSON.parse(await b.readEvent(subRun[0])) : null;
      const outBody = subOut.length ? JSON.parse(await b.readEvent(subOut[0])) : null;
      log("subagent-run:", subRun, "| subagent-output:", subOut);
      log("run.name/source:", runBody?.name, runBody?.source, "| output.content len:", outBody?.content?.length);

      // AFTER DEEP FIX: the injected prompt is NOT written as a us-* message prose.
      // It is reclassified at the kernel into a folded hook-invocation
      // (subagent-run + subagent-output, source:"hook") with the full prompt kept
      // in subagent-output.content.
      expect(clean.length).toBe(1); // the genuine composer message survives
      expect(withSource.length).toBe(0); // NO user-lane source:hook message prose
      expect(subRun.length).toBe(1); // one hook-invocation run…
      expect(subOut.length).toBe(1); // …with its output pass
      expect(runBody?.source).toBe("hook");
      expect(runBody?.name).toBe("Invoked a hook");
      expect(outBody?.content).toContain("Memory Writing Agent"); // full prompt preserved
    } finally {
      await b.close();
    }
  });

  it("Section C: a post-turn-end PostToolUse writes a tool-use mark that reopens the closed turn", async () => {
    const b = await boot();
    try {
      // A completed agent turn: concluding message + turn-end.
      await b.inject("POST", `/sessions/${b.sessionId}/events/prose`, {
        root: b.root, participant_id: b.agentId, content: "Posted the proposal.",
      });
      await b.inject("POST", `/sessions/${b.sessionId}/events/turn-end`, {
        root: b.root, participant_id: b.agentId,
      });

      const before = await b.listEvents();
      const lastAgentBefore = before.filter((f) => f.includes(`_${b.agentId}.`)).pop();
      log("last agent mark BEFORE post-turn tool:", lastAgentBefore);

      // Codex post-task_complete memory-maintenance bash → PostToolUse hook.
      const exit = await runAutoStream(
        b.agentId, "assistant",
        JSON.stringify({
          cwd: b.root, session_id: "codex-live", hook_event_name: "PostToolUse",
          tool_name: "Bash", tool_use_id: "bash-mem-1",
          tool_input: { command: "printf probe >> ~/.codex/memories/MEMORY.md" },
          tool_response: { stdout: "", exit_code: 0 },
        }),
        { env: b.env },
      );
      log("posttooluse-hook exit", exit);

      const after = await b.listEvents();
      const agentAfter = after.filter((f) => f.includes(`_${b.agentId}.`));
      const lastAgentAfter = agentAfter[agentAfter.length - 1];
      const newToolUse = after.filter((f) => f.includes(`_${b.agentId}.tool-use.json`));
      log("agent marks AFTER:", agentAfter);
      log("last agent mark AFTER:", lastAgentAfter, "| tool-use marks:", newToolUse.length);

      // AFTER FIX: the post-turn PostToolUse is guarded out — no tool-use mark is
      // folded into the closed turn, so the latest agent mark stays turn-end
      // (renderer hasClosedCurrentTurn stays true → the bar clears).
      expect(newToolUse.length).toBe(0);
      expect(lastAgentAfter?.endsWith(".turn-end.json")).toBe(true);
    } finally {
      await b.close();
    }
  });

  it("Section C no-regression: an IN-TURN PostToolUse (before any turn-end) still writes normally", async () => {
    const b = await boot();
    try {
      // Agent produces some output but has NOT ended its turn yet.
      await b.inject("POST", `/sessions/${b.sessionId}/events/prose`, {
        root: b.root, participant_id: b.agentId, content: "Working on it…", arbitrary: true,
      });
      const exit = await runAutoStream(
        b.agentId, "assistant",
        JSON.stringify({
          cwd: b.root, session_id: "codex-live", hook_event_name: "PostToolUse",
          tool_name: "Read", tool_use_id: "read-1",
          tool_input: { file_path: "/etc/hosts" },
          tool_response: { content: "ok" },
        }),
        { env: b.env },
      );
      log("in-turn posttooluse exit", exit);
      const toolUses = (await b.listEvents()).filter((f) => f.includes(`_${b.agentId}.tool-use.json`));
      log("in-turn tool-use marks:", toolUses.length);
      // Turn is open → guard does not fire → the tool-use is captured normally.
      expect(toolUses.length).toBe(1);
    } finally {
      await b.close();
    }
  });
});
