import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  extractAccessRequest,
  extractPostToolUseEvent,
  runAutoStream,
} from "../../src/hooks/autoStream.js";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import { computePathId } from "../../src/paths/identity.js";
import { globalPaths } from "../../src/paths/global.js";
import { markFmarkLaunchPrompt } from "../../src/launchPrompt.js";

async function bootstrapProject() {
  const dir = await mkdtemp(join(tmpdir(), "fm-"));
  const fmark = join(dir, ".f-mark");
  await mkdir(fmark, { recursive: true });
  await writeFile(join(fmark, ".token"), "tok-1", "utf8");
  await writeFile(
    join(fmark, "config.json"),
    JSON.stringify({ version: "0.1.0", port: 7777, participants: {} }),
    "utf8",
  );
  await mkdir(join(fmark, "sessions", "sess-1"), { recursive: true });
  await writeActiveSession(join(fmark, "agents"), "ag-claude", "sess-1");
  const transcript = join(dir, "transcript.jsonl");
  await writeFile(
    transcript,
    [
      JSON.stringify({ role: "user", content: [{ type: "text", text: "hi" }] }),
      JSON.stringify({ role: "assistant", content: [{ type: "text", text: "hello!" }] }),
    ].join("\n"),
    "utf8",
  );
  return { dir, fmark, transcript };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

function managedEnv(participantId = "ag-claude"): NodeJS.ProcessEnv {
  return { ...process.env, F_MARK_AGENT_ID: participantId };
}

describe("runAutoStream(assistant)", () => {
  it("posts a concluding prose + turn-end for a one-message turn", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify(stdin),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    // ping + prose + turn-end = 3 calls
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[0][0]).toContain("/agents/ag-claude/ping");
    expect(f.mock.calls[1][0]).toContain("/sessions/sess-1/events/prose");
    expect(JSON.parse(f.mock.calls[1][1].body)).toMatchObject({ arbitrary: false, content: "hello!" });
    expect(f.mock.calls[2][0]).toContain("/sessions/sess-1/events/turn-end");
  });

  it("resolves active-session from global project agent state", async () => {
    const { dir, fmark, transcript } = await bootstrapProject();
    await rm(join(fmark, "agents"), { recursive: true, force: true });
    const xdg = await mkdtemp(join(tmpdir(), "fm-xdg-"));
    const g = globalPaths(join(xdg, "f-mark"));
    await mkdir(join(fmark, "sessions", "sess-global"), { recursive: true });
    await writeActiveSession(
      g.projectAgentsDir(computePathId(dir)),
      "ag-claude",
      "sess-global",
    );
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };

    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify(stdin),
      { env: { ...managedEnv(), XDG_CONFIG_HOME: xdg } },
    );

    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f.mock.calls[1][0]).toContain("/sessions/sess-global/events/prose");
    await rm(xdg, { recursive: true, force: true });
  });

  it("PostToolUse hook posts a single tool-use event and returns", async () => {
    const { dir, transcript: _transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      cwd: dir,
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_use_id: "tu-live",
      tool_input: { file_path: "/tmp/foo.md" },
      tool_response: "file contents",
    };
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify(stdin),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    // ping + one /events/tool-use POST
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toContain("/agents/ag-claude/ping");
    expect(f.mock.calls[1][0]).toContain("/sessions/sess-1/events/tool-use");
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body).toMatchObject({
      tool_name: "Read",
      tool_use_id: "tu-live",
      success: true,
    });
  });

  it("PostToolUse for mcp__fmark__* is dropped (MCP server already posts those)", async () => {
    const { dir } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      cwd: dir,
      hook_event_name: "PostToolUse",
      tool_name: "mcp__fmark__fmark_post_prose",
      tool_use_id: "tu-mcp",
      tool_input: { content: "hi" },
      tool_response: "ok",
    };
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify(stdin),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    /* ping only — the tool-use post is suppressed for fmark MCP tools. */
    const toolUsePosts = f.mock.calls
      .map((call: any) => String(call[0]))
      .filter((u: string) => u.endsWith("/events/tool-use"));
    expect(toolUsePosts).toHaveLength(0);
  });

  it("suppressed PostToolUse with a transcript_path does NOT fall through to Stop projection", async () => {
    /* Defence: even if a suppressed PostToolUse payload happens to
       carry a `transcript_path`, we must NOT read the transcript and
       post turn-end/prose mid-turn. This was a latent control-flow bug
       before Fix #5 review #1. */
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "PostToolUse",
      tool_name: "mcp__fmark__fmark_post_prose",
      tool_use_id: "tu-mcp",
      tool_input: { content: "hi" },
      tool_response: "ok",
    };
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify(stdin),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    const urls = f.mock.calls.map((call: any) => String(call[0]));
    /* Ping is fine; everything else must be silent. */
    expect(urls.filter((u: string) => u.endsWith("/events/tool-use"))).toHaveLength(0);
    expect(urls.filter((u: string) => u.endsWith("/events/prose"))).toHaveLength(0);
    expect(urls.filter((u: string) => u.endsWith("/events/turn-end"))).toHaveLength(0);
  });

  it("Stop drops mcp__fmark__* tool-use from the transcript projection (structured event already exists)", async () => {
    /* When an agent calls fmark_post_prose via MCP, the MCP server
       writes the structured prose event. The transcript also records a
       tool_use block for `mcp__fmark__fmark_post_prose` which would
       project as a generic tool-use card at Stop — that's redundant
       with the structured prose event. Drop it. */
    const { dir } = await bootstrapProject();
    const transcript = join(dir, "fmark-transcript.jsonl");
    await writeFile(
      transcript,
      [
        JSON.stringify({ role: "user", content: [{ type: "text", text: "post a prose" }] }),
        JSON.stringify({
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu-mcp-prose",
              name: "mcp__fmark__fmark_post_prose",
              input: { content: "hi from the agent" },
            },
            { type: "text", text: "done." },
          ],
        }),
        JSON.stringify({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-mcp-prose",
              content: "ok",
              is_error: false,
            },
          ],
        }),
      ].join("\n"),
      "utf8",
    );
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify({
        session_id: "claude-1",
        transcript_path: transcript,
        cwd: dir,
        hook_event_name: "Stop",
        stop_hook_active: false,
      }),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    const urls = f.mock.calls.map((call: any) => String(call[0]));
    /* The generic /events/tool-use POST for mcp__fmark__* must NOT
       happen. The structured prose event (written by the MCP server in
       prod, absent here) is separate; the assistant's trailing "done."
       text still posts as the concluding prose plus turn-end. */
    expect(urls.filter((u: string) => u.endsWith("/events/tool-use"))).toHaveLength(0);
    expect(urls.filter((u: string) => u.endsWith("/events/prose"))).toHaveLength(1);
    expect(urls.filter((u: string) => u.endsWith("/events/turn-end"))).toHaveLength(1);
  });

  it("Stop dedups a tool-use already posted live via PostToolUse", async () => {
    /* Sequence: live PostToolUse posts tool_use_id=tu-dedup; pre-existing
       event file with that id sits in the session; Stop projects the
       same tool call from the transcript; dedupeHookFinalProse drops
       the Stop-time copy while still emitting the concluding prose +
       turn-end. */
    const { dir, fmark } = await bootstrapProject();
    /* Pre-write a tool-use event for the same id so the dedup scan
       finds it. Filename pattern matches the project's FILENAME_REGEX:
       `<YYYYMMDDTHHMMSS.fffZ>_<participant_id>.<kind>.<ext>`. */
    const sessionDir = join(fmark, "sessions", "sess-1");
    await writeFile(
      join(sessionDir, "20260527T100000.000Z_ag-claude.tool-use.json"),
      JSON.stringify({
        schema: "fmark.tool-use.v1",
        participant_id: "ag-claude",
        tool_name: "Read",
        tool_use_id: "tu-dedup",
        input: {},
        result: null,
        success: true,
      }),
      "utf8",
    );
    /* Transcript with the SAME tool_use_id plus a concluding prose. */
    const dedupTranscript = join(dir, "dedup-transcript.jsonl");
    await writeFile(
      dedupTranscript,
      [
        JSON.stringify({ role: "user", content: [{ type: "text", text: "go" }] }),
        JSON.stringify({
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu-dedup",
              name: "Read",
              input: { file_path: "/tmp/foo" },
            },
            { type: "text", text: "done" },
          ],
        }),
        JSON.stringify({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-dedup",
              content: "file contents",
              is_error: false,
            },
          ],
        }),
      ].join("\n"),
      "utf8",
    );

    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify({
        session_id: "claude-1",
        transcript_path: dedupTranscript,
        cwd: dir,
        hook_event_name: "Stop",
        stop_hook_active: false,
      }),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    const urls = f.mock.calls.map((call: any) => String(call[0]));
    /* The Stop branch must NOT post a duplicate /events/tool-use for
       tu-dedup; the prose + turn-end still fire. */
    const toolUsePosts = urls.filter((u: string) => u.endsWith("/events/tool-use"));
    expect(toolUsePosts).toHaveLength(0);
    expect(urls.filter((u: string) => u.endsWith("/events/prose"))).toHaveLength(1);
    expect(urls.filter((u: string) => u.endsWith("/events/turn-end"))).toHaveLength(1);
  });

  it("short-circuits after ping when stop_hook_active=true", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: true,
    };
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify(stdin),
      { env: managedEnv() },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    // Presence ping still fires; no event posts.
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain("/agents/ag-claude/ping");
  });

  it("exits 0 with stderr warning when no active-session pointer exists", async () => {
    const { dir, transcript } = await bootstrapProject();
    await rm(join(dir, ".f-mark", "sessions"), { recursive: true, force: true });
    const xdg = await mkdtemp(join(tmpdir(), "fm-xdg-empty-"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const exit = await runAutoStream(
        "ag-unknown",
        "assistant",
        JSON.stringify({
          session_id: "claude-1",
          transcript_path: transcript,
          cwd: dir,
          hook_event_name: "Stop",
          stop_hook_active: false,
        }),
        { env: { ...managedEnv(), XDG_CONFIG_HOME: xdg } },
      );
      expect(exit).toBe(0);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("no F-Mark session"));
      // No active session → no ping (no participant to ping for).
      expect((globalThis.fetch as any)).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
      await rm(xdg, { recursive: true, force: true });
    }
  });

  it("ignores unmanaged generic hooks when F_MARK_AGENT_ID is missing", async () => {
    const { dir, fmark, transcript } = await bootstrapProject();
    await mkdir(join(fmark, "sessions", "2026-01-01-dynamic"), {
      recursive: true,
    });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdin = {
      session_id: "claude-dynamic-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const exit = await runAutoStream(null, "assistant", JSON.stringify(stdin));
    expect(exit).toBe(0);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("F_MARK_AGENT_ID is not set"),
    );
    expect((globalThis.fetch as any)).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("uses F_MARK_AGENT_ID for managed generic hooks", async () => {
    const { dir, transcript } = await bootstrapProject();
    const stdin = {
      session_id: "claude-managed-1",
      transcript_path: transcript,
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const exit = await runAutoStream(null, "assistant", JSON.stringify(stdin), {
      env: managedEnv(),
    });
    expect(exit).toBe(0);

    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    expect(f.mock.calls[0][0]).toContain("/agents/ag-claude/ping");
    expect(f.mock.calls[1][0]).toContain("/sessions/sess-1/events/prose");
  });

  it("marks hook wait timeout as bridge-timeout, not provider expiry", async () => {
    const { dir } = await bootstrapProject();
    const exit = await runAutoStream(
      "ag-claude",
      "assistant",
      JSON.stringify({
        session_id: "claude-1",
        cwd: dir,
        hook_event_name: "PermissionRequest",
        tool_name: "Edit",
        tool_input: { file_path: "src/app.ts", old_string: "a", new_string: "b" },
      }),
      {
        env: {
          ...managedEnv(),
          F_MARK_ACCESS_REQUEST_TIMEOUT_MS: "1",
        },
      },
    );
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    const accessResponseCall = f.mock.calls.find((call: any) =>
      String(call[0]).endsWith("/events/access-response"),
    );
    expect(accessResponseCall).toBeDefined();
    const body = JSON.parse(accessResponseCall![1].body);
    expect(body).toMatchObject({
      decision: "bridge-timeout",
      status: "bridge-timeout",
      delivered: false,
      delivery: "hook",
    });
    expect(body.error).toContain("provider may still be waiting");
  });
});

describe("runAutoStream(user)", () => {
  it("ignores F-Mark launch packets before pinging or writing user prose", async () => {
    const { dir } = await bootstrapProject();
    await writeActiveSession(join(dir, ".f-mark", "agents"), "us-roey", "sess-1");
    const exit = await runAutoStream(
      "us-roey",
      "user",
      JSON.stringify({
        cwd: dir,
        hook_event_name: "UserPromptSubmit",
        prompt: markFmarkLaunchPrompt("# F-Mark agent onboarding\nUse fmark tools."),
      }),
      { env: managedEnv("ag-codex") },
    );

    expect(exit).toBe(0);
    expect((globalThis.fetch as any)).not.toHaveBeenCalled();
  });

  it("posts user prompt as non-arbitrary prose, no turn-end", async () => {
    const { dir } = await bootstrapProject();
    const stdin = {
      cwd: dir,
      hook_event_name: "UserPromptSubmit",
      prompt: "rerun the suite please",
    };
    await writeActiveSession(join(dir, ".f-mark", "agents"), "us-roey", "sess-1");
    const exit = await runAutoStream("us-roey", "user", JSON.stringify(stdin), {
      env: managedEnv(),
    });
    expect(exit).toBe(0);
    const f = (globalThis.fetch as any) as ReturnType<typeof vi.fn>;
    // ping + prose = 2 calls
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toContain("/agents/us-roey/ping");
    expect(f.mock.calls[1][0]).toContain("/events/prose");
    expect(JSON.parse(f.mock.calls[1][1].body)).toMatchObject({
      content: "rerun the suite please",
      arbitrary: false,
    });
  });
});

describe("extractAccessRequest", () => {
  it("PermissionRequest for fmark_post_prose surfaces content as message", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_prose",
        tool_input: {
          content: "Hello world from the agent",
          participant_id: "ag-claude",
          session_id: "sess-1",
        },
        session_id: "claude-1",
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.title).toBe("mcp__fmark__fmark_post_prose");
    expect(result!.message).toBe("Hello world from the agent");
  });

  it("PermissionRequest for fmark_post_todo surfaces title as message", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_todo",
        tool_input: {
          id: "td-1",
          title: "Ship the fix",
          status: "open",
          participant_id: "ag-claude",
          session_id: "sess-1",
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Ship the fix");
  });

  it("PermissionRequest for fmark_post_choices surfaces question as message", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_choices",
        tool_input: {
          id: "ch-1",
          question: "Which approach should we take?",
          options: [{ id: "a", label: "Option A" }],
          multi: false,
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Which approach should we take?");
  });

  it("PermissionRequest with no known keys falls back to a JSON preview", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_choice",
        tool_input: {
          choices_id: "ch-1",
          selected: ["a"],
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(typeof result!.message).toBe("string");
    /* JSON preview surfaces the structured payload so the user can see
       what the agent is asking permission for. */
    expect(result!.message).toContain("choices_id");
    expect(result!.message).toContain("selected");
  });

  it("JSON preview is size-capped with an ellipsis indicator", () => {
    const huge = "x".repeat(2000);
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__example__weird_tool",
        tool_input: { huge },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message!.length).toBeLessThanOrEqual(800);
    expect(result!.message!.endsWith("…")).toBe(true);
  });

  it("PermissionRequest for Bash keeps `command` as both command and message", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "ls -la", description: "list files" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.command).toBe("ls -la");
    expect(result!.message).toBe("ls -la");
  });

  it("PermissionRequest with only `description` still surfaces it as message", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "SomeTool",
        tool_input: { description: "long-running task" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("long-running task");
  });

  it("ignores legacy ToolPermission Notification access prompts", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "Notification",
        notification_type: "ToolPermission",
        details: { command: "run-something", type: "BashTool" },
      },
      participantId: "ag-opencode",
      runtimeId: "opencode",
    });
    expect(result).toBeNull();
  });

  it("fmark_post_html surfaces the `html` field", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_html",
        tool_input: {
          html: "<div>preview</div>",
          /* no title */
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("<div>preview</div>");
  });

  it("fmark_post_file_ref surfaces the `path` field when no description", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_file_ref",
        tool_input: {
          id: "file-1",
          path: "src/foo.ts",
          mime_type: "text/x-typescript",
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("src/foo.ts");
  });

  it("fmark_post_tool_use surfaces the `tool_name` field", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "mcp__fmark__fmark_post_tool_use",
        tool_input: {
          tool_name: "Bash",
          tool_use_id: "tu-1",
          input: { command: "echo hi" },
          success: true,
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBe("Bash");
  });

  it("null/undefined tool_input returns no message", () => {
    const result = extractAccessRequest({
      payload: {
        hook_event_name: "PermissionRequest",
        tool_name: "BareTool",
        /* no tool_input at all */
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.message).toBeUndefined();
  });

  it("returns null for unrelated hook events", () => {
    const result = extractAccessRequest({
      payload: { hook_event_name: "Stop" },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).toBeNull();
  });
});

describe("extractPostToolUseEvent", () => {
  it("returns a tool-use event for a standard PostToolUse payload", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Read",
        tool_use_id: "tu-1",
        tool_input: { file_path: "/tmp/foo.md" },
        tool_response: "file contents",
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("tool-use");
    if (result!.kind === "tool-use") {
      expect(result!.tool_name).toBe("Read");
      expect(result!.tool_use_id).toBe("tu-1");
      expect(result!.input).toEqual({ file_path: "/tmp/foo.md" });
      expect(result!.result).toBe("file contents");
      expect(result!.success).toBe(true);
    }
  });

  it("skips mcp__fmark__* tools (already posted via the MCP server)", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "mcp__fmark__fmark_post_prose",
        tool_use_id: "tu-mcp",
        tool_input: { content: "x" },
        tool_response: "ok",
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).toBeNull();
  });

  it("skips Claude sub-agent tools (handled by extractSubagentHookEvents)", () => {
    for (const toolName of ["agent", "Task", "AGENT", "task"]) {
      const result = extractPostToolUseEvent({
        payload: {
          hook_event_name: "PostToolUse",
          tool_name: toolName,
          tool_use_id: "tu-sub",
          tool_input: { prompt: "do x" },
          tool_response: "result",
        },
        participantId: "ag-claude",
        runtimeId: "claude",
      });
      expect(result).toBeNull();
    }
  });

  it("returns null for non-PostToolUse events", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "Stop",
        tool_name: "Read",
        tool_use_id: "tu-1",
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).toBeNull();
  });

  it("returns null when tool_name or tool_use_id is missing", () => {
    expect(
      extractPostToolUseEvent({
        payload: { hook_event_name: "PostToolUse", tool_use_id: "tu-1" },
        participantId: "ag-claude",
        runtimeId: "claude",
      }),
    ).toBeNull();
    expect(
      extractPostToolUseEvent({
        payload: { hook_event_name: "PostToolUse", tool_name: "Read" },
        participantId: "ag-claude",
        runtimeId: "claude",
      }),
    ).toBeNull();
  });

  it("marks success=false when the payload includes an error", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_use_id: "tu-err",
        tool_input: { command: "false" },
        tool_response: { is_error: true, content: "exit 1" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") expect(result!.success).toBe(false);
  });

  it("marks success=false on `status: 'failed'` in the response", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_use_id: "tu-status",
        tool_input: {},
        tool_response: { status: "failed", content: "boom" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") expect(result!.success).toBe(false);
  });

  it("marks success=false on camelCase `isError: true`", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_use_id: "tu-camel",
        tool_input: {},
        tool_response: { isError: true, content: "boom" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") expect(result!.success).toBe(false);
  });

  it("treats `error: null` as no error (not a failure signal)", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_use_id: "tu-null",
        tool_input: {},
        error: null,
        tool_response: { content: "ok" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") expect(result!.success).toBe(true);
  });

  it("falls back to `tool_call_id` when `tool_use_id` is absent", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Read",
        tool_call_id: "tc-1",
        tool_input: { file_path: "/tmp/foo" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") expect(result!.tool_use_id).toBe("tc-1");
  });

  it("uses `input` when `tool_input` is absent", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "Read",
        tool_use_id: "tu-fallback",
        input: { file_path: "/tmp/foo" },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") {
      expect(result!.input).toEqual({ file_path: "/tmp/foo" });
    }
  });

  it("defaults input to {} and result to null when both are missing", () => {
    const result = extractPostToolUseEvent({
      payload: {
        hook_event_name: "PostToolUse",
        tool_name: "BareTool",
        tool_use_id: "tu-bare",
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).not.toBeNull();
    if (result!.kind === "tool-use") {
      expect(result!.input).toEqual({});
      expect(result!.result).toBeNull();
    }
  });
});
