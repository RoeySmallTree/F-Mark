#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase19-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 19 sub-agent backend hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, checks: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : null;
      server.close(() => {
        if (port === null) reject(new Error("could not allocate port"));
        else resolvePromise(port);
      });
    });
    server.once("error", reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        input: options.input,
        timeout: options.timeoutMs ?? 35_000,
        maxBuffer: 1024 * 1024 * 4,
      },
      (error, stdout, stderr) => {
        const result = {
          command: [command, ...args].join(" "),
          code: error?.code ?? 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        };
        if (error) {
          const wrapped = new Error(
            `${result.command} failed with code ${result.code}: ${result.stderr || result.stdout}`,
          );
          wrapped.result = result;
          reject(wrapped);
          return;
        }
        resolvePromise(result);
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
    else child.stdin?.end();
  });
}

async function waitForHealth(port) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await sleep(100);
  }
  throw new Error("kernel health check timed out");
}

async function startKernel(project, port, env) {
  const child = spawn(
    process.execPath,
    [DIST_INDEX, "--path", project, "--port", String(port), "--password", TOKEN],
    { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  await waitForHealth(port);
  return {
    async stop() {
      child.kill("SIGTERM");
      await new Promise((resolvePromise) => {
        const timer = setTimeout(resolvePromise, 2_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolvePromise();
        });
      });
      if (child.exitCode === null) child.kill("SIGKILL");
    },
    logs() {
      return logs.join("").replaceAll(TOKEN, "<redacted-token>").slice(-4000);
    },
  };
}

async function api(port, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed ${res.status}: ${text}`);
  return text.length > 0 ? JSON.parse(text) : {};
}

async function registerAgent(port, participantId, runtimeId, name) {
  await api(port, "POST", "/participants/register", {
    kind: "agent",
    name,
    suggested_id: participantId,
    runtime_id: runtimeId,
  });
}

async function listEvents(port, sessionId) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  return body.events ?? body;
}

function hookEnv(ctx, port, participantId, runtimeId, sessionId) {
  return {
    ...ctx.env,
    F_MARK_PATH: ctx.project,
    F_MARK_AGENT_ID: participantId,
    F_MARK_RUNTIME_ID: runtimeId,
    F_MARK_SESSION_ID: sessionId,
  };
}

async function runHook(ctx, port, input) {
  await run(
    process.execPath,
    [DIST_INDEX, "hook", "auto-stream", input.participantId, "--kind", "assistant"],
    {
      cwd: ctx.project,
      env: hookEnv(ctx, port, input.participantId, input.runtimeId, input.sessionId),
      input: `${JSON.stringify(input.payload)}\n`,
      timeoutMs: 45_000,
    },
  );
}

async function writeTranscript(path, entries) {
  await writeFile(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

function eventsByKind(events, kind) {
  return events.filter((event) => event.kind === kind);
}

async function main() {
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase19-hot-"));
  report.artifactRoot = artifactRoot;
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  const ctx = {
    project,
    home,
    xdg,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      NO_COLOR: "1",
    },
  };
  const port = await freePort();
  let kernel;
  try {
    kernel = await startKernel(project, port, ctx.env);
    const created = await api(port, "POST", "/sessions", {
      slug: `${RUN}-subagents`,
      path: project,
    });
    const sessionId = created.id;
    await registerAgent(port, "ag-p19cld", "claude", "Phase 19 Claude");
    await registerAgent(port, "ag-p19cdx", "codex", "Phase 19 Codex");
    await registerAgent(port, "ag-p19gem", "gemini", "Phase 19 Gemini");
    await registerAgent(port, "ag-p19gen", "codex", "Phase 19 Generic");

    const claudeTranscript = join(artifactRoot, "claude-agent.jsonl");
    await writeTranscript(claudeTranscript, [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-claude-agent",
            name: "Agent",
            input: {
              subagent_type: "reviewer",
              prompt: "Find the one-line answer for CLAUDE_SUBAGENT_PHASE19.",
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-claude-agent",
            content: "CLAUDE_SUBAGENT_PHASE19 final attributed output",
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Claude parent final." }],
      },
    ]);
    await runHook(ctx, port, {
      participantId: "ag-p19cld",
      runtimeId: "claude",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "Stop",
        session_id: "claude-runtime-session",
        turn_id: "claude-turn-1",
        transcript_path: claudeTranscript,
      },
    });

    const geminiTranscript = join(artifactRoot, "gemini-invoke-agent.jsonl");
    await writeTranscript(geminiTranscript, [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-gemini-agent",
            name: "invoke_agent",
            input: {
              parameters: {
                agent_name: "research",
                prompt: "Produce GEMINI_SUBAGENT_PHASE19.",
              },
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-gemini-agent",
            content: { output: "GEMINI_SUBAGENT_PHASE19 final attributed output" },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Gemini parent final." }],
      },
    ]);
    await runHook(ctx, port, {
      participantId: "ag-p19gem",
      runtimeId: "gemini",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "Stop",
        session_id: "gemini-runtime-session",
        turn_id: "gemini-turn-1",
        transcript_path: geminiTranscript,
      },
    });

    await runHook(ctx, port, {
      participantId: "ag-p19cld",
      runtimeId: "claude",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "PostToolUse",
        session_id: "claude-runtime-session",
        turn_id: "claude-turn-2",
        tool_use_id: "tu-claude-posttool",
        tool_name: "Agent",
        tool_input: {
          description: "real post-tool payload",
          subagent_type: "general-purpose",
          prompt: "Produce CLAUDE_POSTTOOL_PHASE19.",
        },
        tool_response: {
          content: [{ type: "text", text: "CLAUDE_POSTTOOL_PHASE19 final" }],
        },
      },
    });

    await runHook(ctx, port, {
      participantId: "ag-p19gem",
      runtimeId: "gemini",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "AfterTool",
        session_id: "gemini-runtime-session",
        turn_id: "gemini-turn-2",
        tool_use_id: "tu-gemini-aftertool",
        tool_name: "invoke_agent",
        tool_input: {
          agent_name: "generalist",
          prompt: "Produce GEMINI_AFTERTOOL_PHASE19.",
        },
        tool_response: {
          llmContent: "GEMINI_AFTERTOOL_PHASE19 final",
          returnDisplay: "GEMINI_AFTERTOOL_PHASE19 display",
        },
      },
    });

    const codexTranscript = join(artifactRoot, "codex-multi-agent.jsonl");
    await writeFile(
      codexTranscript,
      [
        {
          type: "session_meta",
          payload: {
            id: "codex-runtime-session",
            source: "exec",
          },
        },
        {
          type: "event_msg",
          payload: {
            type: "task_started",
            turn_id: "codex-turn-transcript",
          },
        },
        {
          type: "response_item",
          payload: {
            type: "function_call",
            name: "spawn_agent",
            namespace: "multi_agent_v1",
            arguments: JSON.stringify({
              message: "Produce CODEX_TRANSCRIPT_PHASE19.",
              agent_type: "default",
            }),
            call_id: "call-codex-spawn",
          },
        },
        {
          type: "response_item",
          payload: {
            type: "function_call_output",
            call_id: "call-codex-spawn",
            output: JSON.stringify({
              agent_id: "codex-child-transcript",
              nickname: "Scout",
            }),
          },
        },
        {
          type: "response_item",
          payload: {
            type: "function_call",
            name: "wait_agent",
            namespace: "multi_agent_v1",
            arguments: JSON.stringify({
              targets: ["codex-child-transcript"],
              timeout_ms: 30000,
            }),
            call_id: "call-codex-wait",
          },
        },
        {
          type: "response_item",
          payload: {
            type: "function_call_output",
            call_id: "call-codex-wait",
            output: JSON.stringify({
              status: {
                "codex-child-transcript": {
                  completed: "CODEX_TRANSCRIPT_PHASE19 final attributed output",
                },
              },
              timed_out: false,
            }),
          },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Codex parent final." }],
          },
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf8",
    );
    await runHook(ctx, port, {
      participantId: "ag-p19cdx",
      runtimeId: "codex",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "Stop",
        session_id: "codex-runtime-session",
        turn_id: "codex-turn-transcript",
        transcript_path: codexTranscript,
      },
    });

    const codexExecStream = join(artifactRoot, "codex-exec-stream.jsonl");
    await writeFile(
      codexExecStream,
      [
        {
          type: "thread.started",
          thread_id: "codex-exec-runtime-session",
        },
        {
          type: "turn.started",
        },
        {
          type: "item.started",
          item: {
            id: "item-codex-spawn",
            type: "collab_tool_call",
            tool: "spawn_agent",
            sender_thread_id: "codex-exec-runtime-session",
            receiver_thread_ids: [],
            prompt: "Return exactly CODEX_EXEC_STREAM_PHASE19.",
            agents_states: {},
            status: "in_progress",
          },
        },
        {
          type: "item.completed",
          item: {
            id: "item-codex-spawn",
            type: "collab_tool_call",
            tool: "spawn_agent",
            sender_thread_id: "codex-exec-runtime-session",
            receiver_thread_ids: ["codex-exec-child"],
            prompt: "Return exactly CODEX_EXEC_STREAM_PHASE19.",
            agents_states: {
              "codex-exec-child": { status: "pending_init", message: null },
            },
            status: "completed",
          },
        },
        {
          type: "item.started",
          item: {
            id: "item-codex-wait",
            type: "collab_tool_call",
            tool: "wait",
            sender_thread_id: "codex-exec-runtime-session",
            receiver_thread_ids: ["codex-exec-child"],
            prompt: null,
            agents_states: {},
            status: "in_progress",
          },
        },
        {
          type: "item.completed",
          item: {
            id: "item-codex-wait",
            type: "collab_tool_call",
            tool: "wait",
            sender_thread_id: "codex-exec-runtime-session",
            receiver_thread_ids: ["codex-exec-child"],
            prompt: null,
            agents_states: {
              "codex-exec-child": {
                status: "completed",
                message: "CODEX_EXEC_STREAM_PHASE19 final attributed output",
              },
            },
            status: "completed",
          },
        },
        {
          type: "item.completed",
          item: {
            id: "item-codex-final",
            type: "agent_message",
            text: "Codex exec parent final.",
          },
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf8",
    );
    await runHook(ctx, port, {
      participantId: "ag-p19cdx",
      runtimeId: "codex",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "Stop",
        session_id: "codex-exec-runtime-session",
        transcript_path: codexExecStream,
      },
    });

    await runHook(ctx, port, {
      participantId: "ag-p19cdx",
      runtimeId: "codex",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "SubagentStart",
        session_id: "codex-runtime-session",
        turn_id: "codex-turn-1",
        tool_use_id: "codex-tool-1",
        agent_id: "codex-child-1",
        agent_type: "reviewer",
        prompt: "Produce CODEX_SUBAGENT_PHASE19.",
      },
    });
    await runHook(ctx, port, {
      participantId: "ag-p19cdx",
      runtimeId: "codex",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "SubagentStop",
        session_id: "codex-runtime-session",
        turn_id: "codex-turn-1",
        tool_use_id: "codex-tool-1",
        agent_id: "codex-child-1",
        agent_type: "reviewer",
        status: "completed",
        last_assistant_message: "CODEX_SUBAGENT_PHASE19 final attributed output",
      },
    });

    const genericTranscript = join(artifactRoot, "generic-tool.jsonl");
    await writeTranscript(genericTranscript, [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-generic-read",
            name: "Read",
            input: { file_path: "notes.txt" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-generic-read",
            content: "UNATTRIBUTABLE_TOOL_PHASE19 result",
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Generic parent final." }],
      },
    ]);
    await runHook(ctx, port, {
      participantId: "ag-p19gen",
      runtimeId: "codex",
      sessionId,
      payload: {
        cwd: project,
        hook_event_name: "Stop",
        session_id: "generic-runtime-session",
        turn_id: "generic-turn-1",
        transcript_path: genericTranscript,
      },
    });

    const events = await listEvents(port, sessionId);
    const runs = eventsByKind(events, "subagent-run");
    const outputs = eventsByKind(events, "subagent-output");
    const toolUses = eventsByKind(events, "tool-use");
    const prose = eventsByKind(events, "prose");

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("CLAUDE_SUBAGENT_PHASE19")),
      "Claude Agent transcript did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19cld" &&
          event.payload.parent_tool_use_id === "tu-claude-agent" &&
          event.payload.source === "transcript" &&
          event.payload.source_confidence === "medium",
      ),
      "Claude Agent transcript did not produce attributed subagent-run",
    );
    pass("claude Agent transcript captured final sub-agent output", {
      runCount: runs.filter((event) => event.participant_id === "ag-p19cld").length,
    });

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("GEMINI_SUBAGENT_PHASE19")),
      "Gemini invoke_agent transcript did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19gem" &&
          event.payload.name === "research" &&
          event.payload.parent_tool_use_id === "tu-gemini-agent",
      ),
      "Gemini invoke_agent transcript did not produce attributed subagent-run",
    );
    pass("gemini invoke_agent transcript captured final sub-agent output", {
      runCount: runs.filter((event) => event.participant_id === "ag-p19gem").length,
    });

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("CLAUDE_POSTTOOL_PHASE19")),
      "Claude PostToolUse Agent hook did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19cld" &&
          event.payload.parent_tool_use_id === "tu-claude-posttool" &&
          event.payload.source_confidence === "high",
      ),
      "Claude PostToolUse Agent hook did not produce high-confidence run",
    );
    pass("claude PostToolUse Agent hook captured final sub-agent output", {
      outputCount: outputs.filter((event) =>
        JSON.stringify(event.payload).includes("CLAUDE_POSTTOOL_PHASE19"),
      ).length,
    });

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("GEMINI_AFTERTOOL_PHASE19")),
      "Gemini AfterTool invoke_agent hook did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19gem" &&
          event.payload.parent_tool_use_id === "tu-gemini-aftertool" &&
          event.payload.source_confidence === "high",
      ),
      "Gemini AfterTool invoke_agent hook did not produce high-confidence run",
    );
    pass("gemini AfterTool invoke_agent hook captured final sub-agent output", {
      outputCount: outputs.filter((event) =>
        JSON.stringify(event.payload).includes("GEMINI_AFTERTOOL_PHASE19"),
      ).length,
    });

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("CODEX_TRANSCRIPT_PHASE19")),
      "Codex multi_agent_v1 transcript did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19cdx" &&
          event.payload.subagent_id === "codex-child-transcript" &&
          event.payload.parent_tool_use_id ===
            "call-codex-wait:codex-child-transcript" &&
          event.payload.source === "transcript" &&
          event.payload.source_confidence === "medium",
      ),
      "Codex multi_agent_v1 transcript did not produce attributed subagent-run",
    );
    pass("codex multi_agent_v1 transcript captured final sub-agent output", {
      outputCount: outputs.filter((event) =>
        JSON.stringify(event.payload).includes("CODEX_TRANSCRIPT_PHASE19"),
      ).length,
    });

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("CODEX_EXEC_STREAM_PHASE19")),
      "Codex exec JSON stream did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19cdx" &&
          event.payload.subagent_id === "codex-exec-child" &&
          event.payload.parent_tool_use_id === "item-codex-wait:codex-exec-child" &&
          event.payload.source === "transcript" &&
          event.payload.source_confidence === "medium",
      ),
      "Codex exec JSON stream did not produce attributed subagent-run",
    );
    pass("codex exec JSON stream captured final sub-agent output", {
      outputCount: outputs.filter((event) =>
        JSON.stringify(event.payload).includes("CODEX_EXEC_STREAM_PHASE19"),
      ).length,
    });

    assert(
      outputs.some((event) => JSON.stringify(event.payload).includes("CODEX_SUBAGENT_PHASE19")),
      "Codex SubagentStop hook did not produce subagent-output",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19cdx" &&
          event.payload.status === "started" &&
          event.payload.source_confidence === "high",
      ),
      "Codex SubagentStart hook did not produce high-confidence started run",
    );
    assert(
      runs.some(
        (event) =>
          event.participant_id === "ag-p19cdx" &&
          event.payload.status === "completed" &&
          event.payload.subagent_id === "codex-child-1",
      ),
      "Codex SubagentStop hook did not produce completed run",
    );
    pass("codex SubagentStart/SubagentStop hooks captured start and final output", {
      runCount: runs.filter((event) => event.participant_id === "ag-p19cdx").length,
    });

    assert(
      toolUses.some(
        (event) =>
          event.participant_id === "ag-p19gen" &&
          event.payload.tool_name === "Read" &&
          (JSON.stringify(event.payload.result) ?? "").includes(
            "UNATTRIBUTABLE_TOOL_PHASE19",
          ),
      ),
      "generic tool did not remain a tool-use event",
    );
    assert(
      !runs.some((event) => event.participant_id === "ag-p19gen") &&
        !outputs.some((event) => event.participant_id === "ag-p19gen"),
      "generic tool was incorrectly promoted to subagent events",
    );
    pass("unattributable tool output stayed as parent tool-use", {
      toolUseCount: toolUses.filter((event) => event.participant_id === "ag-p19gen").length,
    });

    const search = await api(
      port,
      "GET",
      `/search?scope=all&q=${encodeURIComponent("CODEX_SUBAGENT_PHASE19")}&limit=20`,
    );
    assert(
      (search.hits ?? []).some(
        (hit) =>
          hit.event.kind === "subagent-output" &&
          hit.session_id === sessionId &&
          hit.path === project,
      ),
      "all-scope search did not find subagent-output with path/session tags",
    );
    pass("all-session search indexes sub-agent output with path and session tags", {
      hits: (search.hits ?? []).length,
    });

    assert(
      prose.some((event) => JSON.stringify(event.payload).includes("Claude parent final.")),
      "parent prose did not continue after sub-agent projection",
    );
    pass("parent assistant output continues after sub-agent projection", {
      proseCount: prose.length,
      totalEvents: events.length,
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    if (kernel !== undefined) report.kernelLogs = kernel.logs();
    const reportPath = join(artifactRoot, "report.failed.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED ${reportPath}`);
    throw err;
  } finally {
    if (kernel !== undefined) await kernel.stop();
    if (process.env.FMARK_KEEP_HOT_ARTIFACTS !== "1") {
      for (const entry of await import("node:fs/promises").then((m) => m.readdir(artifactRoot))) {
        if (entry === "report.json" || entry === "report.failed.json") continue;
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
