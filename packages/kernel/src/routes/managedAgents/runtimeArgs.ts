import { readFile } from "node:fs/promises";
import type {
  EnsureManagedAgentsResponse,
  RuntimeEntry,
  RuntimeOverridePatch,
  RuntimeSessionInfo,
} from "@f-mark/shared";
import { codexFmarkMcpApprovalConfigArgs } from "../../mcpInstall/codex.js";
import { getAdapter } from "../../runtimes/adapters/index.js";
import {
  codexSessionsRoot,
  findManagedCodexRollout,
} from "../../services/codexRolloutLiveText.js";

type EnsureSkippedReason = EnsureManagedAgentsResponse["skipped"][number]["reason"];

interface ResumeArgsResult {
  ok: true;
  args: string[];
  nativeNameApplied: boolean;
  nativeSessionId: string;
  nativeCommand: string;
  recoveredTranscriptPath?: string;
  nativeIdSource?: RuntimeSessionInfo["native_id_source"];
}

interface ResumeArgsSkip {
  ok: false;
  reason: EnsureSkippedReason;
  detail: string;
}

type StripDecision = "keep" | "drop" | "drop-next";

function supportsNativeSessionName(runtimeId: string): boolean {
  return runtimeId === "claude";
}

function hasClaudeNameArg(args: string[]): boolean {
  return args.includes("--name") || args.includes("-n");
}

export function applyRuntimeOverride(
  runtimeId: string,
  args: string[],
  override: RuntimeOverridePatch | undefined,
): string[] {
  if (!override || (!override.model && !override.effort)) return args;
  const adapter = getAdapter(runtimeId);
  if (!adapter) return args;
  const sanitized = adapter.sanitizeArgs(args, override);
  return [...sanitized, ...adapter.buildSpawnArgs(override)];
}

export function terminalPollerKeyFor(
  rootKey: string,
  participantId: string,
): string {
  return `${rootKey}::${participantId}`;
}

function stripRuntimeAccessArgs(runtimeId: string, args: string[]): string[] {
  if (runtimeId === "claude") return stripArgs(args, claudeAccessArgDecision);
  if (runtimeId === "codex") return stripArgs(args, codexAccessArgDecision);
  if (runtimeId === "opencode") return stripArgs(args, opencodeAccessArgDecision);
  return [...args];
}

function stripArgs(
  args: string[],
  decisionFor: (arg: string) => StripDecision,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const decision = decisionFor(arg);
    if (decision === "drop-next") {
      i++;
      continue;
    }
    if (decision === "drop") continue;
    out.push(arg);
  }
  return out;
}

function claudeAccessArgDecision(arg: string): StripDecision {
  if (arg === "--permission-mode") return "drop-next";
  if (arg.startsWith("--permission-mode=")) return "drop";
  if (
    arg === "--dangerously-skip-permissions" ||
    arg === "--allow-dangerously-skip-permissions"
  ) {
    return "drop";
  }
  return "keep";
}

function codexAccessArgDecision(arg: string): StripDecision {
  if (arg === "-a" || arg === "--ask-for-approval") return "drop-next";
  if (arg.startsWith("-a=") || arg.startsWith("--ask-for-approval=")) {
    return "drop";
  }
  return "keep";
}

function opencodeAccessArgDecision(arg: string): StripDecision {
  if (arg === "--dangerously-skip-permissions") return "drop";
  return "keep";
}

function applyRuntimeAccessMode(
  runtimeId: string,
  args: string[],
  accessMode: string,
): string[] {
  const base = stripRuntimeAccessArgs(runtimeId, args);
  if (accessMode === "default") return base;
  if (runtimeId === "claude") return [...base, "--permission-mode", accessMode];
  if (runtimeId === "codex") return [...base, "-a", accessMode];
  if (runtimeId === "opencode" && accessMode === "dangerously-skip-permissions") {
    return [...base, "--dangerously-skip-permissions"];
  }
  return base;
}

function applyRuntimeOwnedMcpApprovals(runtimeId: string, args: string[]): string[] {
  if (runtimeId === "codex") {
    return [...args, ...codexFmarkMcpApprovalConfigArgs()];
  }
  return args;
}

export function spawnArgsForRuntime(input: {
  runtimeId: string;
  args: string[];
  desiredName: string | null;
  launchPrompt: string;
  override?: RuntimeOverridePatch;
  accessMode: string;
}): {
  args: string[];
  nativeNameApplied: boolean;
  launchPromptDelivery: "native" | "tmux";
} {
  let args = applyRuntimeOverride(input.runtimeId, input.args, input.override);
  args = applyRuntimeAccessMode(input.runtimeId, args, input.accessMode);
  args = applyRuntimeOwnedMcpApprovals(input.runtimeId, args);
  let nativeNameApplied = false;
  if (
    input.desiredName !== null &&
    supportsNativeSessionName(input.runtimeId) &&
    !hasClaudeNameArg(input.args)
  ) {
    args = ["--name", input.desiredName, ...args];
    nativeNameApplied = true;
  }

  if (input.runtimeId === "claude" || input.runtimeId === "codex") {
    return {
      args: [...args, input.launchPrompt],
      nativeNameApplied,
      launchPromptDelivery: "native",
    };
  }

  if (input.runtimeId === "opencode") {
    const hasPromptArg = args.some((arg) => arg === "--prompt");
    if (!hasPromptArg) {
      return {
        args: [...args, "--prompt", input.launchPrompt],
        nativeNameApplied,
        launchPromptDelivery: "native",
      };
    }
  }

  return { args, nativeNameApplied, launchPromptDelivery: "tmux" };
}

async function codexSessionIdFromRollout(
  rolloutPath: string,
): Promise<string | null> {
  try {
    const raw = await readFile(rolloutPath, "utf8");
    const first = raw.split("\n").find((line) => line.trim().length > 0);
    if (first === undefined) return null;
    const parsed = JSON.parse(first) as {
      type?: unknown;
      payload?: { id?: unknown };
    };
    if (parsed.type !== "session_meta") return null;
    return typeof parsed.payload?.id === "string" &&
      parsed.payload.id.length > 0
      ? parsed.payload.id
      : null;
  } catch {
    return null;
  }
}

async function recoverCodexResumeId(input: {
  runtimeSession: RuntimeSessionInfo | null;
  participantId: string;
  activeSession: string;
  projectRoot: string;
  env: NodeJS.ProcessEnv;
}): Promise<{
  nativeSessionId: string | null;
  transcriptPath?: string;
  source?: RuntimeSessionInfo["native_id_source"];
}> {
  const persisted = input.runtimeSession?.native_session_id;
  if (typeof persisted === "string" && persisted.length > 0) {
    return {
      nativeSessionId: persisted,
      transcriptPath: input.runtimeSession?.native_transcript_path ?? undefined,
      source: input.runtimeSession?.native_id_source,
    };
  }

  const transcriptPath = input.runtimeSession?.native_transcript_path;
  if (typeof transcriptPath === "string" && transcriptPath.length > 0) {
    const id = await codexSessionIdFromRollout(transcriptPath);
    if (id !== null) {
      return {
        nativeSessionId: id,
        transcriptPath,
        source: "recovered-storage",
      };
    }
  }

  const rollout = await findManagedCodexRollout({
    sessionsRoot: codexSessionsRoot(input.env),
    projectRoot: input.projectRoot,
    participantId: input.participantId,
    sessionId: input.activeSession,
  });
  if (rollout === null) return { nativeSessionId: null };
  const id = await codexSessionIdFromRollout(rollout);
  return {
    nativeSessionId: id,
    ...(id !== null
      ? { transcriptPath: rollout, source: "recovered-storage" }
      : {}),
  };
}

export async function buildResumeArgs(input: {
  runtimeId: string;
  runtime: RuntimeEntry;
  runtimeSession: RuntimeSessionInfo | null;
  activeSession: string;
  participantId: string;
  projectRoot: string;
  override?: RuntimeOverridePatch;
  accessMode: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ResumeArgsResult | ResumeArgsSkip> {
  const args = providerBaseArgs({
    runtimeId: input.runtimeId,
    args: input.runtime.args,
    override: input.override,
    accessMode: input.accessMode,
  });

  if (input.runtimeId === "claude") {
    return buildClaudeResumeArgs(input, args);
  }
  if (input.runtimeId === "codex") {
    return buildCodexResumeArgs(input, args);
  }
  if (input.runtimeId === "opencode") {
    return buildOpencodeResumeArgs(input, args);
  }
  return {
    ok: false,
    reason: "resume-unsupported",
    detail: `runtime does not support provider-native resume: ${input.runtimeId}`,
  };
}

function providerBaseArgs(input: {
  runtimeId: string;
  args: string[];
  override?: RuntimeOverridePatch;
  accessMode: string;
}): string[] {
  let args = applyRuntimeOverride(
    input.runtimeId,
    input.args,
    input.override,
  );
  args = applyRuntimeAccessMode(input.runtimeId, args, input.accessMode);
  return applyRuntimeOwnedMcpApprovals(input.runtimeId, args);
}

function buildClaudeResumeArgs(
  input: {
    runtime: RuntimeEntry;
    runtimeSession: RuntimeSessionInfo | null;
  },
  args: string[],
): ResumeArgsResult | ResumeArgsSkip {
  const handle =
    input.runtimeSession?.native_session_id ??
    (input.runtimeSession?.native_name_applied === true
      ? input.runtimeSession.desired_name
      : null);
  if (handle === null || handle.length === 0) {
    return {
      ok: false,
      reason: "missing-native-session-id",
      detail:
        "Claude resume requires a provider session id or a provider-applied F-Mark session name",
    };
  }
  const resumeArgs = [...args, "--resume", handle];
  return {
    ok: true,
    args: resumeArgs,
    nativeNameApplied: input.runtimeSession?.native_name_applied === true,
    nativeSessionId: handle,
    nativeCommand: `${input.runtime.executable} ${resumeArgs.join(" ")}`,
    nativeIdSource:
      input.runtimeSession?.native_session_id !== undefined
        ? input.runtimeSession.native_id_source
        : "manual",
  };
}

async function buildCodexResumeArgs(
  input: {
    runtime: RuntimeEntry;
    runtimeSession: RuntimeSessionInfo | null;
    participantId: string;
    activeSession: string;
    projectRoot: string;
    env?: NodeJS.ProcessEnv;
  },
  args: string[],
): Promise<ResumeArgsResult | ResumeArgsSkip> {
  const recovered = await recoverCodexResumeId({
    runtimeSession: input.runtimeSession,
    participantId: input.participantId,
    activeSession: input.activeSession,
    projectRoot: input.projectRoot,
    env: input.env ?? process.env,
  });
  if (recovered.nativeSessionId === null) {
    return {
      ok: false,
      reason: "missing-native-session-id",
      detail:
        "Codex resume requires a provider rollout/session id; no safe local recovery was found",
    };
  }
  const resumeArgs = [...args, "resume", recovered.nativeSessionId];
  return {
    ok: true,
    args: resumeArgs,
    nativeNameApplied: false,
    nativeSessionId: recovered.nativeSessionId,
    nativeCommand: `${input.runtime.executable} ${resumeArgs.join(" ")}`,
    ...(recovered.transcriptPath !== undefined
      ? { recoveredTranscriptPath: recovered.transcriptPath }
      : {}),
    nativeIdSource: recovered.source,
  };
}

function buildOpencodeResumeArgs(
  input: {
    runtime: RuntimeEntry;
    runtimeSession: RuntimeSessionInfo | null;
    activeSession: string;
  },
  args: string[],
): ResumeArgsResult | ResumeArgsSkip {
  const handle =
    input.runtimeSession?.native_session_id ??
    input.runtimeSession?.desired_name ??
    input.activeSession;
  if (handle.length === 0) {
    return {
      ok: false,
      reason: "missing-native-session-id",
      detail: "OpenCode resume requires a session handle",
    };
  }
  const resumeArgs = [...args, "run", "--session", handle];
  return {
    ok: true,
    args: resumeArgs,
    nativeNameApplied: false,
    nativeSessionId: handle,
    nativeCommand: `${input.runtime.executable} ${resumeArgs.join(" ")}`,
    nativeIdSource: input.runtimeSession?.native_id_source,
  };
}
