import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  extractAccessRequest,
  extractLiveAssistantTextEvent,
  extractPostToolUseEvent,
} from "../../src/hooks/autoStream.js";
import {
  markFmarkLaunchPrompt,
  markFmarkWakePrompt,
} from "../../src/launchPrompt.js";
import {
  bootstrapProject,
  expectConcludingProseWithoutToolUse,
  expectEventCount,
  expectNoEventPosts,
  expectPing,
  expectPostUrl,
  findCallByUrl,
  jsonBodyAt,
  jsonBodyOf,
  managedEnv,
  messageDisplayPayload,
  postToolUsePayload,
  readRuntimeSession,
  runAssistantHook,
  runHookExitZero,
  runUserHook,
  stopPayload,
  writeGlobalActiveSession,
  writeHookProse,
  writeJsonl,
  writeLocalActiveSession,
  writeMcpTurnEnd,
  writeSessionEvent,
  writeTranscript,
} from "./autoStream/helpers.js";

let savedXdgConfigHome: string | undefined;
let testXdgConfigHome: string | null = null;

beforeEach(async () => {
  savedXdgConfigHome = process.env.XDG_CONFIG_HOME;
  testXdgConfigHome = await mkdtemp(join(tmpdir(), "fm-auto-xdg-"));
  process.env.XDG_CONFIG_HOME = testXdgConfigHome;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (savedXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedXdgConfigHome;
  if (testXdgConfigHome !== null) {
    await rm(testXdgConfigHome, { recursive: true, force: true });
    testXdgConfigHome = null;
  }
});

describe("runAutoStream(assistant)", () => {
  it("posts a concluding prose + turn-end for a one-message turn", async () => {
    const { dir, transcript } = await bootstrapProject();
    const f = await runAssistantHook(stopPayload(dir, transcript));

    // ping + prose + turn-end = 3 calls
    expect(f).toHaveBeenCalledTimes(3);
    expectPing(f, "ag-claude");
    expectPostUrl(f, 1, "/sessions/sess-1/events/prose");
    expect(jsonBodyAt(f, 1)).toMatchObject({ arbitrary: false, content: "hello!" });
    expectPostUrl(f, 2, "/sessions/sess-1/events/turn-end");
  });

  it("persists provider session and transcript ids from hook payloads", async () => {
    const { dir, transcript } = await bootstrapProject();
    await runAssistantHook(
      stopPayload(dir, transcript, { session_id: "claude-native-1" }),
    );

    expect(await readRuntimeSession(dir, testXdgConfigHome!)).toMatchObject({
      desired_name: "sess-1",
      native_name_applied: false,
      native_session_id: "claude-native-1",
      native_transcript_path: transcript,
      native_id_source: "hook",
    });
  });
});

describe("runAutoStream(assistant)", () => {
  it("suppresses live MessageDisplay text after MCP already ended the agent turn", async () => {
    const { dir, fmark } = await bootstrapProject();
    await writeMcpTurnEnd(fmark);

    const f = await runAssistantHook(
      messageDisplayPayload(dir, { delta: "extra wrapper text" }),
    );

    expectNoEventPosts(f, "/events/prose");
  });

  it("allows live MessageDisplay text after newer user activity reopens the turn", async () => {
    const { dir, fmark } = await bootstrapProject();
    await writeMcpTurnEnd(fmark);
    await writeSessionEvent(
      fmark,
      "20260101T000001.000Z_us-test.prose.md",
      "---\nsource: manual\n---\nnext request\n",
    );

    const f = await runAssistantHook(
      messageDisplayPayload(dir, { delta: "live text" }),
    );

    const proseCall = findCallByUrl(f, (url) => url.endsWith("/events/prose"));
    expect(proseCall).toBeTruthy();
    expect(jsonBodyOf(proseCall!)).toMatchObject({
      arbitrary: true,
      content: "live text",
    });
  });

  it("suppresses Stop transcript projection after MCP already ended the agent turn", async () => {
    const { dir, fmark, transcript } = await bootstrapProject();
    await writeMcpTurnEnd(fmark);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    expectNoEventPosts(f, "/events/prose", "/events/turn-end");
  });

  it("does not re-post a REWORDED closing message the agent already posted via MCP", async () => {
    // Regression: codex posts its closing message via fmark_post_prose, ends
    // the turn, then its native transcript holds a REWORDED copy. Projecting
    // that transcript would append a near-duplicate (content dedup can't match
    // the reworded text) plus a stray turn-end ("working but turn ended"). The
    // closed turn must drop the projection outright — the MCP post is canonical.
    const { dir, fmark } = await bootstrapProject();
    await writeSessionEvent(
      fmark,
      "20260101T000000.000Z_ag-claude.prose.md",
      "---\nsource: mcp\narbitrary: false\n---\nBlocked by the sandbox; the session path is /tmp/x.\n",
    );
    await writeMcpTurnEnd(fmark);
    // The transcript's final message is the SAME point, reworded.
    const transcript = await writeTranscript(dir, "reworded.jsonl", [
      { role: "user", content: [{ type: "text", text: "see it?" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "The session is rooted at /tmp/x; sandbox blocks it." },
        ],
      },
    ]);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    expectNoEventPosts(f, "/events/prose", "/events/turn-end");
  });
});

describe("runAutoStream(assistant)", () => {
  it("falls back to the matching Codex rollout when Stop has no transcript_path", async () => {
    const { dir, fmark } = await bootstrapProject();
    await writeLocalActiveSession(fmark, "ag-codex");
    const codexHome = await mkdtemp(join(tmpdir(), "fm-codex-home-"));
    const sessionsDir = join(codexHome, "sessions", "2026", "06", "15");
    await mkdir(sessionsDir, { recursive: true });
    await writeJsonl(
      join(sessionsDir, "rollout-2026-06-15T17-14-16-codex-real.jsonl"),
      [
        {
          type: "session_meta",
          payload: { id: "codex-real", cwd: dir },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Codex final text." }],
          },
        },
      ],
    );

    const f = await runAssistantHook({
      session_id: "codex-real",
      cwd: dir,
      hook_event_name: "Stop",
      stop_hook_active: false,
    }, {
      participantId: "ag-codex",
      env: {
        ...managedEnv("ag-codex"),
        CODEX_HOME: codexHome,
        F_MARK_RUNTIME_ID: "codex",
      },
    });

    const proseCall = findCallByUrl(f, (url) =>
      url.includes("/sessions/sess-1/events/prose"),
    );
    expect(proseCall).toBeDefined();
    expect(jsonBodyOf(proseCall!)).toMatchObject({
      arbitrary: false,
      content: "Codex final text.",
    });
    await rm(codexHome, { recursive: true, force: true });
  });
});

describe("runAutoStream(assistant)", () => {
  it("resolves active-session from global project agent state", async () => {
    const { dir, fmark, transcript } = await bootstrapProject();
    await rm(join(fmark, "agents"), { recursive: true, force: true });
    const xdg = await mkdtemp(join(tmpdir(), "fm-xdg-"));
    await mkdir(join(fmark, "sessions", "sess-global"), { recursive: true });
    await writeGlobalActiveSession(dir, xdg, "ag-claude", "sess-global");

    const f = await runAssistantHook(stopPayload(dir, transcript), {
      env: { ...managedEnv(), XDG_CONFIG_HOME: xdg },
    });

    expectPostUrl(f, 1, "/sessions/sess-global/events/prose");
    await rm(xdg, { recursive: true, force: true });
  });

  it("PostToolUse hook posts a single tool-use event and returns", async () => {
    const { dir } = await bootstrapProject();
    const f = await runAssistantHook(
      postToolUsePayload(dir, {
        tool_name: "Read",
        tool_use_id: "tu-live",
        tool_input: { file_path: "/tmp/foo.md" },
        tool_response: "file contents",
      }),
    );

    // ping + one /events/tool-use POST
    expect(f).toHaveBeenCalledTimes(2);
    expectPing(f, "ag-claude");
    expectPostUrl(f, 1, "/sessions/sess-1/events/tool-use");
    expect(jsonBodyAt(f, 1)).toMatchObject({
      tool_name: "Read",
      tool_use_id: "tu-live",
      success: true,
    });
  });
});

describe("runAutoStream(assistant)", () => {
  it("MessageDisplay hook posts live assistant text as arbitrary prose", async () => {
    const { dir } = await bootstrapProject();
    const f = await runAssistantHook(
      messageDisplayPayload(dir, {
        turn_id: "turn-live",
        message_id: "msg-live",
        index: 0,
        final: false,
        delta: "I am going to check the renderer path.\n",
      }),
    );

    expect(f).toHaveBeenCalledTimes(2);
    expectPing(f, "ag-claude");
    expectPostUrl(f, 1, "/sessions/sess-1/events/prose");
    expect(jsonBodyAt(f, 1)).toMatchObject({
      content: "I am going to check the renderer path.\n",
      arbitrary: true,
    });
  });

  it("dedupes repeated MessageDisplay text already captured in the open turn", async () => {
    const { dir, fmark } = await bootstrapProject();
    await writeHookProse(fmark, "I am going to check the renderer path.");
    const f = await runAssistantHook(
      messageDisplayPayload(dir, {
        delta: "I am going to check the renderer path.",
      }),
    );
    expectEventCount("/events/prose", 0, f);
  });

  it("empty MessageDisplay batches do not fall through to Stop projection", async () => {
    const { dir, transcript } = await bootstrapProject();
    const f = await runAssistantHook(
      messageDisplayPayload(dir, {
        transcript_path: transcript,
        turn_id: "turn-live",
        message_id: "msg-live",
        index: 2,
        final: true,
        delta: "",
      }),
    );

    expectNoEventPosts(f, "/events/prose", "/events/turn-end");
  });
});

describe("runAutoStream(assistant)", () => {
  it("PostToolUse for mcp__fmark__* is dropped (MCP server already posts those)", async () => {
    const { dir } = await bootstrapProject();
    const f = await runAssistantHook(
      postToolUsePayload(dir, {
        tool_name: "mcp__fmark__fmark_post_prose",
        tool_use_id: "tu-mcp",
        tool_input: { content: "hi" },
        tool_response: "ok",
      }),
    );

    /* ping only — the tool-use post is suppressed for fmark MCP tools. */
    expectEventCount("/events/tool-use", 0, f);
  });

  it("suppressed PostToolUse with a transcript_path does NOT fall through to Stop projection", async () => {
    /* Defence: even if a suppressed PostToolUse payload happens to
       carry a `transcript_path`, we must NOT read the transcript and
       post turn-end/prose mid-turn. This was a latent control-flow bug
       before Fix #5 review #1. */
    const { dir, transcript } = await bootstrapProject();
    const f = await runAssistantHook(
      postToolUsePayload(dir, {
        transcript_path: transcript,
        tool_name: "mcp__fmark__fmark_post_prose",
        tool_use_id: "tu-mcp",
        tool_input: { content: "hi" },
        tool_response: "ok",
      }),
    );

    /* Ping is fine; everything else must be silent. */
    expectNoEventPosts(f, "/events/tool-use", "/events/prose", "/events/turn-end");
  });
});

describe("runAutoStream(assistant)", () => {
  it("Stop drops mcp__fmark__* tool-use from the transcript projection (structured event already exists)", async () => {
    /* When an agent calls fmark_post_prose via MCP, the MCP server
       writes the structured prose event. The transcript also records a
       tool_use block for `mcp__fmark__fmark_post_prose` which would
       project as a generic tool-use card at Stop — that's redundant
       with the structured prose event. Drop it. */
    const { dir } = await bootstrapProject();
    const transcript = await writeTranscript(dir, "fmark-transcript.jsonl", [
      { role: "user", content: [{ type: "text", text: "post a prose" }] },
      {
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
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-mcp-prose",
            content: "ok",
            is_error: false,
          },
        ],
      },
    ]);
    const f = await runAssistantHook(stopPayload(dir, transcript));

    /* The generic /events/tool-use POST for mcp__fmark__* must NOT
       happen. The structured prose event (written by the MCP server in
       prod, absent here) is separate; the assistant's trailing "done."
       text still posts as the concluding prose plus turn-end. */
    expectConcludingProseWithoutToolUse(f);
  });
});

describe("runAutoStream(assistant)", () => {
  it("Stop drops arbitrary prose already captured live in the open turn", async () => {
    const { dir, fmark } = await bootstrapProject();
    const content = "Now I'll build the visualization using the Ember theme.";
    await writeHookProse(fmark, content);
    const transcript = await writeTranscript(
      dir,
      "live-dedup-transcript.jsonl",
      [
        { role: "user", content: [{ type: "text", text: "go" }] },
        {
          role: "assistant",
          content: [
            { type: "text", text: content },
            {
              type: "tool_use",
              id: "tu-fmark-html",
              name: "mcp__fmark__fmark_post_html",
              input: { title: "Preview", html: "<div>preview</div>" },
            },
          ],
        },
      ],
    );

    const f = await runAssistantHook(stopPayload(dir, transcript));
    expectNoEventPosts(f, "/events/prose", "/events/tool-use", "/events/turn-end");
  });
});

describe("runAutoStream(assistant)", () => {
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
    await writeSessionEvent(
      fmark,
      "20260527T100000.000Z_ag-claude.tool-use.json",
      JSON.stringify({
        schema: "fmark.tool-use.v1",
        participant_id: "ag-claude",
        tool_name: "Read",
        tool_use_id: "tu-dedup",
        input: {},
        result: null,
        success: true,
      }),
    );
    /* Transcript with the SAME tool_use_id plus a concluding prose. */
    const dedupTranscript = await writeTranscript(
      dir,
      "dedup-transcript.jsonl",
      [
        { role: "user", content: [{ type: "text", text: "go" }] },
        {
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
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-dedup",
              content: "file contents",
              is_error: false,
            },
          ],
        },
      ],
    );

    const f = await runAssistantHook(stopPayload(dir, dedupTranscript));
    /* The Stop branch must NOT post a duplicate /events/tool-use for
       tu-dedup; the prose + turn-end still fire. */
    expectConcludingProseWithoutToolUse(f);
  });
});

describe("runAutoStream(assistant)", () => {
  it("short-circuits after ping when stop_hook_active=true", async () => {
    const { dir, transcript } = await bootstrapProject();
    const f = await runAssistantHook(
      stopPayload(dir, transcript, { stop_hook_active: true }),
    );

    // Presence ping still fires; no event posts.
    expect(f).toHaveBeenCalledTimes(1);
    expectPing(f, "ag-claude");
  });

  it("exits 0 with stderr warning when no active-session pointer exists", async () => {
    const { dir, transcript } = await bootstrapProject();
    await rm(join(dir, ".f-mark", "sessions"), { recursive: true, force: true });
    const xdg = await mkdtemp(join(tmpdir(), "fm-xdg-empty-"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const f = await runAssistantHook(stopPayload(dir, transcript), {
        participantId: "ag-unknown",
        env: { ...managedEnv(), XDG_CONFIG_HOME: xdg },
      });
      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining("no explicit F-Mark session"),
      );
      // No active session → no ping (no participant to ping for).
      expect(f).not.toHaveBeenCalled();
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
    const f = await runHookExitZero(
      null,
      "assistant",
      stopPayload(dir, transcript, { session_id: "claude-dynamic-1" }),
    );
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("F_MARK_AGENT_ID is not set"),
    );
    expect(f).not.toHaveBeenCalled();
    stderr.mockRestore();
  });
});

describe("runAutoStream(assistant)", () => {
  it("uses F_MARK_AGENT_ID for managed generic hooks", async () => {
    const { dir, transcript } = await bootstrapProject();
    const f = await runAssistantHook(stopPayload(dir, transcript, {
      session_id: "claude-managed-1",
    }), {
      participantId: null,
      env: managedEnv(),
    });

    expectPing(f, "ag-claude");
    expectPostUrl(f, 1, "/sessions/sess-1/events/prose");
  });

  it("prefers F_MARK_AGENT_ID over a stale assistant hook argument", async () => {
    const { dir, transcript } = await bootstrapProject();
    const f = await runAssistantHook(stopPayload(dir, transcript, {
      session_id: "claude-managed-1",
    }), {
      participantId: "ag-stale",
      env: managedEnv("ag-claude"),
    });

    expectPing(f, "ag-claude");
    expect(jsonBodyAt(f, 1)).toMatchObject({
      participant_id: "ag-claude",
    });
  });

  it("marks hook wait timeout as bridge-timeout, not provider expiry", async () => {
    const { dir } = await bootstrapProject();
    const f = await runAssistantHook(
      {
        session_id: "claude-1",
        cwd: dir,
        hook_event_name: "PermissionRequest",
        tool_name: "Edit",
        tool_input: { file_path: "src/app.ts", old_string: "a", new_string: "b" },
      },
      {
        env: {
          ...managedEnv(),
          F_MARK_ACCESS_REQUEST_TIMEOUT_MS: "1",
        },
      },
    );
    const accessResponseCall = findCallByUrl(f, (url) =>
      url.endsWith("/events/access-response"),
    );
    expect(accessResponseCall).toBeDefined();
    const body = jsonBodyOf(accessResponseCall!);
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
    const { dir, fmark } = await bootstrapProject();
    await writeLocalActiveSession(fmark, "us-roey");
    const f = await runUserHook(
      "us-roey",
      {
        cwd: dir,
        hook_event_name: "UserPromptSubmit",
        prompt: markFmarkLaunchPrompt("# F-Mark agent onboarding\nUse fmark tools."),
      },
      { env: managedEnv("ag-codex") },
    );

    expect(f).not.toHaveBeenCalled();
  });

  it("ignores F-Mark wake packets before pinging or writing user prose", async () => {
    const { dir, fmark } = await bootstrapProject();
    await writeLocalActiveSession(fmark, "us-roey");
    const f = await runUserHook(
      "us-roey",
      {
        cwd: dir,
        hook_event_name: "UserPromptSubmit",
        prompt: markFmarkWakePrompt(
          '# F-Mark wake packet\n\n```json\n{"type": "fmark.wake"}\n```',
        ),
      },
      { env: managedEnv("ag-codex") },
    );

    expect(f).not.toHaveBeenCalled();
  });

  it("reclassifies user prompt hooks as subagent events, no prose or turn-end", async () => {
    const { dir, fmark } = await bootstrapProject();
    const stdin = {
      cwd: dir,
      hook_event_name: "UserPromptSubmit",
      prompt: "rerun the suite please",
    };
    await writeLocalActiveSession(fmark, "us-roey");
    const f = await runUserHook("us-roey", stdin, {
      env: { ...managedEnv(), F_MARK_SESSION_ID: "sess-1" },
    });

    // ping + subagent-run + subagent-output = 3 calls
    expect(f).toHaveBeenCalledTimes(3);
    expectPing(f, "us-roey");
    expectEventCount("/events/prose", 0, f);
    expectEventCount("/events/subagent-run", 1, f);
    expectEventCount("/events/subagent-output", 1, f);
    expectEventCount("/events/turn-end", 0, f);
    expectPostUrl(f, 1, "/events/subagent-run");
    expectPostUrl(f, 2, "/events/subagent-output");

    const runBody = jsonBodyAt(f, 1) as Record<string, unknown>;
    const outputBody = jsonBodyAt(f, 2) as Record<string, unknown>;
    expect(runBody).toMatchObject({
      participant_id: "us-roey",
      schema: "fmark.subagent-run.v1",
      name: "Invoked a hook",
      source: "hook",
      source_confidence: "high",
      prompt_preview: "rerun the suite please",
    });
    expect(outputBody).toMatchObject({
      participant_id: "us-roey",
      schema: "fmark.subagent-output.v1",
      content: "rerun the suite please",
      source: "hook",
    });
    expect(outputBody.correlation_id).toBe(runBody.correlation_id);
  });

  it("uses F_MARK_USER_ID when reclassifying managed generic user hooks", async () => {
    const { dir, fmark } = await bootstrapProject();
    const stdin = {
      cwd: dir,
      hook_event_name: "UserPromptSubmit",
      prompt: "rerun the suite please",
    };
    await writeLocalActiveSession(fmark, "us-roey");
    const f = await runHookExitZero(null, "user", stdin, {
      env: {
        ...managedEnv("ag-codex", "us-roey"),
        F_MARK_SESSION_ID: "sess-1",
      },
    });

    expect(f).toHaveBeenCalledTimes(3);
    expectPing(f, "us-roey");
    expectEventCount("/events/prose", 0, f);
    expectEventCount("/events/subagent-run", 1, f);
    expectEventCount("/events/subagent-output", 1, f);
    expectEventCount("/events/turn-end", 0, f);
    expectPostUrl(f, 1, "/events/subagent-run");
    expectPostUrl(f, 2, "/events/subagent-output");

    const runBody = jsonBodyAt(f, 1) as Record<string, unknown>;
    const outputBody = jsonBodyAt(f, 2) as Record<string, unknown>;
    expect(runBody).toMatchObject({
      participant_id: "us-roey",
      schema: "fmark.subagent-run.v1",
      name: "Invoked a hook",
      source: "hook",
      source_confidence: "high",
      prompt_preview: "rerun the suite please",
    });
    expect(outputBody).toMatchObject({
      participant_id: "us-roey",
      schema: "fmark.subagent-output.v1",
      content: "rerun the suite please",
      source: "hook",
    });
    expect(outputBody.correlation_id).toBe(runBody.correlation_id);
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
});

describe("extractAccessRequest", () => {
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
});

describe("extractAccessRequest", () => {
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
});

describe("extractAccessRequest", () => {
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
});

describe("extractAccessRequest", () => {
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

describe("extractLiveAssistantTextEvent", () => {
  it("extracts Claude MessageDisplay delta as arbitrary prose", () => {
    const result = extractLiveAssistantTextEvent({
      payload: {
        hook_event_name: "MessageDisplay",
        delta: "live chunk",
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).toEqual({
      kind: "prose",
      content: "live chunk",
      arbitrary: true,
    });
  });

  it("extracts nested assistant text content", () => {
    const result = extractLiveAssistantTextEvent({
      payload: {
        hook_event_name: "MessageDisplay",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "first " },
            { type: "text", text: "second" },
          ],
        },
      },
      participantId: "ag-claude",
      runtimeId: "claude",
    });
    expect(result).toEqual({
      kind: "prose",
      content: "first second",
      arbitrary: true,
    });
  });

  it("returns null for empty or unrelated hook payloads", () => {
    expect(
      extractLiveAssistantTextEvent({
        payload: { hook_event_name: "MessageDisplay", delta: "" },
        participantId: "ag-claude",
        runtimeId: "claude",
      }),
    ).toBeNull();
    expect(
      extractLiveAssistantTextEvent({
        payload: { hook_event_name: "Stop", delta: "done" },
        participantId: "ag-claude",
        runtimeId: "claude",
      }),
    ).toBeNull();
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
});

describe("extractPostToolUseEvent", () => {
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
});

describe("extractPostToolUseEvent", () => {
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
});

describe("extractPostToolUseEvent", () => {
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
});

describe("extractPostToolUseEvent", () => {
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
