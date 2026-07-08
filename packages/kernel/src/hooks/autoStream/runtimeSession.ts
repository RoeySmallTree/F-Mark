import type { RuntimeSessionInfo } from "@f-mark/shared";
import type { HookContext } from "../bootstrap.js";
import { createHookAgentStateStore } from "../../services/agentState.js";
import type { HookPayload } from "./types.js";
import { stringField } from "./fields.js";
import { CodexTranscriptResolver } from "./codexTranscript.js";

export class HookRuntimeSessionPersister {
  constructor(
    private readonly transcripts = new CodexTranscriptResolver(),
  ) {}

  async persist(input: {
    ctx: HookContext;
    participantId: string;
    fmarkSessionId: string;
    payload: HookPayload;
    env: NodeJS.ProcessEnv;
    cwd: string;
    runtimeId: string | null;
  }): Promise<void> {
    const agentState = createHookAgentStateStore({
      projectRoot: input.ctx.path,
      fmarkDir: input.ctx.fmarkDir,
      env: input.env,
    });
    const patch = await this.runtimeSessionPatch(input);
    if (this.hasNativeRuntimeInfo(patch)) {
      await agentState.mergeRuntimeSession(input.participantId, patch);
    }
    await agentState.updateControlState(input.participantId, {
      last_activity_at: new Date().toISOString(),
      idle_stopped_at: null,
      idle_stop_reason: null,
      pane_lifecycle: "live",
    });
  }

  private async runtimeSessionPatch(input: {
    fmarkSessionId: string;
    payload: HookPayload;
    env: NodeJS.ProcessEnv;
    cwd: string;
    runtimeId: string | null;
  }): Promise<Partial<RuntimeSessionInfo>> {
    const native = await this.nativeRuntimeInfo(input);
    return {
      desired_name: input.fmarkSessionId,
      ...native,
    };
  }

  private async nativeRuntimeInfo(input: {
    payload: HookPayload;
    env: NodeJS.ProcessEnv;
    cwd: string;
    runtimeId: string | null;
  }): Promise<Partial<RuntimeSessionInfo>> {
    let nativeSessionId = stringField(input.payload, "session_id");
    let transcriptPath = stringField(input.payload, "transcript_path");
    let nativeIdSource: RuntimeSessionInfo["native_id_source"] =
      nativeSessionId !== undefined ? "hook" : undefined;

    if (input.runtimeId === "codex") {
      transcriptPath = await this.codexTranscriptPath(input, transcriptPath);
      const recovered = await this.recoverCodexSessionId(
        nativeSessionId,
        transcriptPath,
      );
      nativeSessionId = recovered.nativeSessionId;
      nativeIdSource = recovered.nativeIdSource ?? nativeIdSource;
    }

    return {
      ...(nativeSessionId !== undefined
        ? {
            native_session_id: nativeSessionId,
            native_id_source: nativeIdSource ?? "hook",
          }
        : {}),
      ...(transcriptPath !== undefined
        ? { native_transcript_path: transcriptPath }
        : {}),
    };
  }

  private async codexTranscriptPath(
    input: {
      payload: HookPayload;
      env: NodeJS.ProcessEnv;
      cwd: string;
    },
    explicit: string | undefined,
  ): Promise<string | undefined> {
    if (explicit !== undefined) return explicit;
    return (
      (await this.transcripts.findFallback({
        env: input.env,
        payload: input.payload,
        cwd: input.cwd,
      })) ?? undefined
    );
  }

  private async recoverCodexSessionId(
    nativeSessionId: string | undefined,
    transcriptPath: string | undefined,
  ): Promise<{
    nativeSessionId: string | undefined;
    nativeIdSource: RuntimeSessionInfo["native_id_source"] | undefined;
  }> {
    if (nativeSessionId !== undefined || transcriptPath === undefined) {
      return { nativeSessionId, nativeIdSource: undefined };
    }
    const meta = await this.transcripts.readMeta(transcriptPath);
    return {
      nativeSessionId: meta?.id,
      nativeIdSource: meta?.id === undefined ? undefined : "recovered-storage",
    };
  }

  private hasNativeRuntimeInfo(patch: Partial<RuntimeSessionInfo>): boolean {
    return (
      patch.native_session_id !== undefined ||
      patch.native_transcript_path !== undefined
    );
  }
}
