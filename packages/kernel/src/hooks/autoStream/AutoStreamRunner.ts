import { randomUUID } from "node:crypto";
import { readFile } from "fs/promises";
import type { HookContext } from "../bootstrap.js";
import { loadHookContext } from "../bootstrap.js";
import { postPing, postProjectedEvents } from "../post.js";
import { projectTurnToEvents, type ProjectedEvent } from "../projectTurn.js";
import { extractLastAssistantTurn } from "../transcript.js";
import { isFmarkInjectedPrompt } from "../../launchPrompt.js";
import type {
  AssistantStdin,
  AutoStreamKind,
  AutoStreamOptions,
  HookPayload,
  UserStdin,
} from "./types.js";
import { stringField } from "./fields.js";
import { HookParticipantResolver } from "./participants.js";
import { HookRuntimeSessionPersister } from "./runtimeSession.js";
import { AccessRequestBridge, AccessRequestExtractor } from "./accessRequests.js";
import { LiveAssistantTextExtractor } from "./liveAssistant.js";
import { PostToolUseProjector, SubagentHookProjector } from "./subagents.js";
import { HookEventDedupe, HookTurnInspector } from "./dedupe.js";
import { StopProseCoalescer } from "./proseCoalescer.js";
import { CodexTranscriptResolver } from "./codexTranscript.js";
import { RuntimeStatePoster } from "./runtimeState.js";

interface AutoStreamExecution {
  payload: HookPayload;
  env: NodeJS.ProcessEnv;
  cwd: string;
  ctx: HookContext;
  participantId: string;
  sessionId: string;
  runtimeId: string | null;
  hookEventName: string | undefined;
}

export class AutoStreamRunner {
  constructor(
    private readonly participants = new HookParticipantResolver(),
    private readonly runtimeSessions = new HookRuntimeSessionPersister(),
    private readonly accessRequests = new AccessRequestExtractor(),
    private readonly accessBridge = new AccessRequestBridge(),
    private readonly liveText = new LiveAssistantTextExtractor(),
    private readonly subagents = new SubagentHookProjector(),
    private readonly toolUses = new PostToolUseProjector(),
    private readonly turns = new HookTurnInspector(),
    private readonly dedupe = new HookEventDedupe(turns),
    private readonly coalescer = new StopProseCoalescer(),
    private readonly transcripts = new CodexTranscriptResolver(),
    private readonly runtimeState = new RuntimeStatePoster(),
  ) {}

  async run(
    explicitParticipantId: string | null,
    kind: AutoStreamKind,
    stdinRaw: string,
    options: AutoStreamOptions = {},
  ): Promise<number> {
    const payload = this.parsePayload(stdinRaw);
    if (payload === null) return 0;
    const env = options.env ?? process.env;
    if (this.isIgnoredInjectedPrompt(kind, payload)) return 0;
    const execution = await this.prepareExecution({
      explicitParticipantId,
      kind,
      payload,
      env,
    });
    if (execution === null) return 0;
    await this.recordHookActivity(execution);
    await this.maybePostRuntimeState(execution);
    if (await this.handleAccessRequest(execution)) return 0;
    return kind === "assistant"
      ? this.handleAssistant(execution)
      : this.handleUser(execution);
  }

  private parsePayload(stdinRaw: string): HookPayload | null {
    try {
      return JSON.parse(stdinRaw) as HookPayload;
    } catch {
      process.stderr.write("f-mark auto-stream: invalid JSON on stdin\n");
      return null;
    }
  }

  /* Kernel-injected prompts (launch onboarding, wake packets) arrive through
     the runtime's UserPromptSubmit hook like any typed input; without this
     filter they'd be mirrored into the session as user prose. */
  private isIgnoredInjectedPrompt(
    kind: AutoStreamKind,
    payload: HookPayload,
  ): boolean {
    if (kind !== "user") return false;
    const userPayload = payload as UserStdin;
    return isFmarkInjectedPrompt(userPayload.prompt ?? userPayload.user_input ?? "");
  }

  private async prepareExecution(input: {
    explicitParticipantId: string | null;
    kind: AutoStreamKind;
    payload: HookPayload;
    env: NodeJS.ProcessEnv;
  }): Promise<AutoStreamExecution | null> {
    const cwd = (input.payload as { cwd?: string }).cwd ?? process.cwd();
    const ctx = await this.loadContext(cwd, input.env);
    if (ctx === null) return null;
    const participantId = await this.resolveParticipant(input, ctx);
    if (participantId === null) return null;
    const sessionId = await this.resolveSession(ctx, participantId, input);
    if (sessionId === null) return null;
    return {
      payload: input.payload,
      env: input.env,
      cwd,
      ctx,
      participantId,
      sessionId,
      runtimeId: runtimeIdFromEnv(input.env),
      hookEventName: stringField(input.payload, "hook_event_name"),
    };
  }

  private async loadContext(
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): Promise<HookContext | null> {
    try {
      return await loadHookContext(cwd, env);
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
      return null;
    }
  }

  private async resolveParticipant(
    input: {
      explicitParticipantId: string | null;
      kind: AutoStreamKind;
      payload: HookPayload;
      env: NodeJS.ProcessEnv;
    },
    ctx: HookContext,
  ): Promise<string | null> {
    try {
      return await this.participants.resolveParticipantId({ ...input, ctx });
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
      return null;
    }
  }

  private async resolveSession(
    ctx: HookContext,
    participantId: string,
    input: {
      payload: HookPayload;
      env: NodeJS.ProcessEnv;
      explicitParticipantId: string | null;
    },
  ): Promise<string | null> {
    const sessionId = await this.participants.resolveSessionId({
      ctx,
      participantId,
      payload: input.payload,
      env: input.env,
      allowLinkedActiveSession: this.canUseLinkedActiveSession(
        participantId,
        input,
      ),
    });
    if (sessionId !== null) return sessionId;
    await this.pingIfActivePointerExists(
      ctx,
      participantId,
      input.env,
      input.explicitParticipantId,
      this.canUseLinkedActiveSession(participantId, input),
    );
    process.stderr.write(
      `f-mark auto-stream: no explicit F-Mark session found for ${participantId}; set F_MARK_SESSION_ID or fmark_session_id\n`,
    );
    return null;
  }

  private canUseLinkedActiveSession(
    participantId: string,
    input: {
      payload: HookPayload;
      env: NodeJS.ProcessEnv;
    },
  ): boolean {
    return (
      input.env.F_MARK_AGENT_ID === participantId &&
      stringField(input.payload, "hook_event_name") !== "UserPromptSubmit"
    );
  }

  private async pingIfActivePointerExists(
    ctx: HookContext,
    participantId: string,
    env: NodeJS.ProcessEnv,
    explicitParticipantId: string | null,
    allowLinkedActiveSession: boolean,
  ): Promise<void> {
    if (!allowLinkedActiveSession) return;
    if (explicitParticipantId !== null && explicitParticipantId !== participantId) {
      return;
    }
    if (
      await this.participants.hasActiveSessionPointer({
        ctx,
        participantId,
        env,
      })
    ) {
      await postPing(ctx, participantId);
    }
  }

  private async recordHookActivity(input: AutoStreamExecution): Promise<void> {
    await postPing(input.ctx, input.participantId);
    await this.runtimeSessions.persist({
      ctx: input.ctx,
      participantId: input.participantId,
      fmarkSessionId: input.sessionId,
      payload: input.payload,
      env: input.env,
      cwd: input.cwd,
      runtimeId: input.runtimeId,
    });
  }

  private async maybePostRuntimeState(input: AutoStreamExecution): Promise<void> {
    if (!["Stop", "PostToolUse", "AfterTool"].includes(input.hookEventName ?? "")) {
      return;
    }
    await this.runtimeState.maybePost({
      ctx: input.ctx,
      participantId: input.participantId,
      runtimeId: input.runtimeId,
      payload: input.payload,
    });
  }

  private async handleAccessRequest(input: AutoStreamExecution): Promise<boolean> {
    const request = this.accessRequests.extract({
      payload: input.payload,
      participantId: input.participantId,
      runtimeId: input.runtimeId,
    });
    if (request === null) return false;
    try {
      await this.accessBridge.handle({ ...input, request });
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: access request → ${err.message}\n`);
    }
    return true;
  }

  private async handleAssistant(input: AutoStreamExecution): Promise<number> {
    if (await this.postSubagentEvents(input)) return 0;
    if (await this.handleLiveAssistantText(input)) return 0;
    if (await this.handlePostToolUse(input)) return 0;
    return this.handleAssistantStop(input);
  }

  private async postSubagentEvents(input: AutoStreamExecution): Promise<boolean> {
    const events = this.subagents.extract({
      payload: input.payload,
      participantId: input.participantId,
      runtimeId: input.runtimeId,
    });
    if (events.length === 0) return false;
    await this.safePostEvents(input, events, "sub-agent capture");
    return true;
  }

  private async handleLiveAssistantText(
    input: AutoStreamExecution,
  ): Promise<boolean> {
    if (!this.liveText.isHook(input.payload)) return false;
    const event = this.liveText.extract({
      payload: input.payload,
      participantId: input.participantId,
      runtimeId: input.runtimeId,
    });
    if (event === null) {
      await this.logSuppressed(input, "live-text-no-extractable-content");
      return true;
    }
    if (await this.turnIsClosedOrDuplicate(input, event.content)) {
      await this.logSuppressed(input, "live-text-turn-closed-or-duplicate", event.content);
      return true;
    }
    await this.safePostEvents(input, [event], "assistant text capture");
    return true;
  }

  /* Suppressions are correct behavior, but they must stay visible: a dropped
     message is indistinguishable from a broken pipeline without a trace of
     what was dropped and why. stderr is this hook CLI's diagnostic channel
     (captured in the runtime's hook log) and is synchronous, so the line
     lands before the process exits — no fire-and-forget fetch to lose. */
  private async logSuppressed(
    input: AutoStreamExecution,
    reason: string,
    content?: string,
  ): Promise<void> {
    const preview =
      content === undefined
        ? ""
        : ` "${content.slice(0, 80).replace(/\s+/g, " ").trim()}"`;
    process.stderr.write(
      `f-mark auto-stream: suppressed ${reason} for ${input.participantId}${preview}\n`,
    );
  }

  private async handlePostToolUse(input: AutoStreamExecution): Promise<boolean> {
    if (input.hookEventName !== "PostToolUse") return false;
    const event = this.toolUses.extract({
      payload: input.payload,
      participantId: input.participantId,
      runtimeId: input.runtimeId,
    });
    if (event === null) {
      await this.logSuppressed(input, "tool-use-no-extractable-content");
      return true;
    }
    // Out-of-band guard: a PostToolUse that arrives after the participant's turn
    // is already closed is post-turn hook activity (e.g. Codex memory maintenance
    // running bash after task_complete). Folding it into the closed turn reopens
    // the turn and re-arms activity_state:"running" — the stuck "running a
    // command" bar. Mirror handleLiveAssistantText's closed-turn guard.
    if (await this.turns.participantCurrentTurnIsClosed(this.turnProbe(input))) {
      await this.logSuppressed(input, "tool-use-turn-closed");
      return true;
    }
    await this.safePostEvents(input, [event], "tool-use capture");
    return true;
  }

  private async turnIsClosedOrDuplicate(
    input: AutoStreamExecution,
    content: string,
  ): Promise<boolean> {
    const turn = this.turnProbe(input);
    return (
      (await this.turns.participantCurrentTurnIsClosed(turn)) ||
      (await this.turns.hasMatchingCurrentTurnSelfProse({ ...turn, content }))
    );
  }

  private turnProbe(input: AutoStreamExecution): {
    projectRoot: string;
    sessionId: string;
    participantId: string;
  } {
    return {
      projectRoot: input.ctx.path,
      sessionId: input.sessionId,
      participantId: input.participantId,
    };
  }

  private async safePostEvents(
    input: AutoStreamExecution,
    events: Parameters<typeof postProjectedEvents>[3],
    label: string,
  ): Promise<void> {
    try {
      await postProjectedEvents(input.ctx, input.participantId, input.sessionId, events, {
        emitTurnEnd: false,
      });
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: ${label} -> ${err.message}\n`);
    }
  }

  /* A Stop can land AFTER the participant already ended the turn via MCP
     (fmark_end_turn). Codex posts its closing message through fmark_post_prose
     and then ends the turn, so by the time this Stop fires the message is
     already in the log — and codex often REWORDS the copy that lands in its
     native transcript. Projecting that transcript here would re-post a near-
     duplicate (content dedup can't match the reworded text) AND re-emit a
     turn-end, which reads as "working but the turn already ended". So a
     closed turn drops the projection outright — the authoritative copy is the
     agent's own MCP post. (A genuinely-dropped closing message — one the agent
     never posted via MCP — is not worth resurrecting at the cost of duplicating
     every reworded one; see the git history of this method.) */
  private async handleAssistantStop(input: AutoStreamExecution): Promise<number> {
    if ((input.payload as AssistantStdin).stop_hook_active === true) return 0;
    if (await this.turns.participantCurrentTurnIsClosed(this.turnProbe(input))) {
      await this.logSuppressed(input, "stop-projection-turn-closed");
      return 0;
    }
    const transcript = await this.readAssistantTranscript(input);
    if (transcript === null) return 0;
    const blocks = extractLastAssistantTurn(transcript);
    const events = projectTurnToEvents(blocks, {
      parentParticipantId: input.participantId,
      parentRuntimeId: input.runtimeId,
      parentRuntimeSessionId: stringField(input.payload, "session_id"),
      parentTurnId: stringField(input.payload, "turn_id"),
    });
    const coalesced = await this.coalescer.coalesce({
      ...this.turnProbe(input),
      events,
    });
    const dedupedEvents = await this.dedupe.dedupeFinalProse({
      ...this.turnProbe(input),
      events: coalesced,
    });
    if (dedupedEvents.length === 0) {
      await this.logSuppressed(input, "stop-projection-all-deduped");
      return 0;
    }
    await postProjectedEvents(
      input.ctx,
      input.participantId,
      input.sessionId,
      dedupedEvents,
    );
    return 0;
  }

  private async readAssistantTranscript(
    input: AutoStreamExecution,
  ): Promise<string | null> {
    const transcriptPath = await this.transcripts.resolve(input);
    if (transcriptPath === null) {
      process.stderr.write(
        "f-mark auto-stream: no transcript_path found for assistant Stop hook\n",
      );
      return null;
    }
    try {
      return await readFile(transcriptPath, "utf8");
    } catch (err: any) {
      process.stderr.write(
        `f-mark auto-stream: cannot read transcript ${transcriptPath}: ${err.message}\n`,
      );
      return null;
    }
  }

  private async handleUser(input: AutoStreamExecution): Promise<number> {
    const userPayload = input.payload as UserStdin;
    const text = (userPayload.prompt ?? userPayload.user_input ?? "").trim();
    if (!text) return 0;
    // A prompt that reaches handleUser is NOT a genuine F-Mark composer message:
    // composer messages are persisted directly by the renderer (no source), and
    // F-Mark's own wake/launch packets are already sentinel-dropped upstream
    // (isIgnoredInjectedPrompt). So this text reached the agent OUTSIDE the
    // composer — typically injected by the agent's environment (e.g. Codex's
    // "Memory Writing Agent" memory-consolidation prompt). Reclassify it into a
    // folded hook-invocation (subagent-run + subagent-output, source:"hook")
    // instead of a us-* message prose, so it NEVER renders as a message the human
    // sent, and the full prompt stays inspectable (subagent-output.content has no
    // length cap; prompt_preview is capped at 4000). Attributed to the user
    // participant so scopedWrite — which only reconciles managed-agent ids — never
    // re-arms activity_state:"running" (no stuck "running a command" bar).
    const correlationId = randomUUID();
    const events: ProjectedEvent[] = [
      {
        kind: "subagent-run",
        schema: "fmark.subagent-run.v1",
        parent_participant_id: input.participantId,
        parent_runtime_id: input.runtimeId,
        subagent_id: correlationId,
        name: "Invoked a hook",
        role: "hook",
        prompt_preview: text.length > 4000 ? text.slice(0, 4000) : text,
        status: "completed",
        correlation_id: correlationId,
        sequence: 0,
        source: "hook",
        source_confidence: "high",
      },
      {
        kind: "subagent-output",
        schema: "fmark.subagent-output.v1",
        parent_participant_id: input.participantId,
        parent_runtime_id: input.runtimeId,
        subagent_id: correlationId,
        content: text,
        arbitrary: false,
        status: "completed",
        correlation_id: correlationId,
        sequence: 1,
        source: "hook",
        source_confidence: "high",
      },
    ];
    try {
      await postProjectedEvents(input.ctx, input.participantId, input.sessionId, events, {
        emitTurnEnd: false,
      });
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: hook reclassify → ${err.message}\n`);
    }
    return 0;
  }
}

function runtimeIdFromEnv(env: NodeJS.ProcessEnv): string | null {
  const value = env.F_MARK_RUNTIME_ID;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
