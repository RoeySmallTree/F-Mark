import {
  applyClaudeHooks,
  detectClaudeHookLocations,
  renderClaudeInstallPrompt,
  renderClaudeInstallSnippet,
  type ClaudeHookScope,
} from "./claude.js";
import {
  applyCodexHooks,
  detectCodexHooks,
  loadCodexConfig,
  renderCodexInstallSnippet,
} from "./codex.js";
import {
  applyOpencodeHooks,
  detectOpencodeHooks,
  renderOpencodeInstallSnippet,
  type OpencodeHookScope,
} from "./opencode.js";
import type { DetectResult } from "./types.js";

export async function checkHookInstallStatus(opts: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  projectRoot?: string;
}): Promise<DetectResult> {
  const userId = opts.userParticipantId ?? "us-unknown";
  if (opts.runtimeId === "claude") {
    return detectClaudeHookLocations({
      projectRoot: opts.projectRoot,
    });
  }
  if (opts.runtimeId === "codex") {
    if (!opts.participantId) throw new Error("participantId required for codex hooks");
    const toml = await loadCodexConfig(opts.projectRoot);
    return detectCodexHooks(toml, opts.participantId, userId);
  }
  if (opts.runtimeId === "opencode") {
    return detectOpencodeHooks({ projectRoot: opts.projectRoot });
  }
  throw new Error(`unknown runtime_id: ${opts.runtimeId}`);
}

export function renderInstallInstructions(opts: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
}): {
  markdown: string;
  manualSteps: { configPath: string; snippet: string }[];
  promptSteps?: { label: string; text: string }[];
} {
  if (opts.runtimeId === "claude") {
    const snippet = renderClaudeInstallSnippet();
    return {
      markdown: snippet,
      manualSteps: [
        { configPath: ".claude/settings.json or ~/.claude/settings.json", snippet },
      ],
      promptSteps: [
        {
          label: "Claude prompt",
          text: renderClaudeInstallPrompt(),
        },
      ],
    };
  }
  if (opts.runtimeId === "codex") {
    if (!opts.participantId || !opts.userParticipantId) {
      throw new Error("participantId and userParticipantId required for codex hooks");
    }
    const snippet = renderCodexInstallSnippet(opts.participantId, opts.userParticipantId);
    return { markdown: snippet, manualSteps: [{ configPath: "~/.codex/config.toml", snippet }] };
  }
  if (opts.runtimeId === "opencode") {
    const snippet = renderOpencodeInstallSnippet();
    return {
      markdown: snippet,
      manualSteps: [
        {
          configPath: ".opencode/plugin/fmark.ts or ~/.config/opencode/plugin/fmark.ts",
          snippet,
        },
      ],
    };
  }
  throw new Error(`unknown runtime_id: ${opts.runtimeId}`);
}

export async function applyHookInstall(opts: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  scope: ClaudeHookScope;
  projectRoot?: string;
}): Promise<{
  applied: boolean;
  scope: ClaudeHookScope;
  configPath: string;
  status: DetectResult;
}> {
  if (opts.runtimeId !== "claude") {
    throw new Error(`auto-apply is not supported for runtime_id: ${opts.runtimeId}`);
  }
  const applied = await applyClaudeHooks({
    scope: opts.scope,
    projectRoot: opts.projectRoot,
  });
  return {
    applied: applied.changed,
    scope: opts.scope,
    configPath: applied.configPath,
    status: await checkHookInstallStatus({
      runtimeId: opts.runtimeId,
      participantId: opts.participantId,
      userParticipantId: opts.userParticipantId,
      projectRoot: opts.projectRoot,
    }),
  };
}

export async function applyAutomaticHookInstall(opts: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  projectRoot?: string;
  scope?: ClaudeHookScope;
}): Promise<{
  changed: boolean;
  status: DetectResult;
  configPath: string;
}> {
  if (opts.runtimeId === "claude") {
    const applied = await applyClaudeHooks({
      scope: opts.scope ?? "local",
      projectRoot: opts.projectRoot,
    });
    return {
      changed: applied.changed,
      configPath: applied.configPath,
      status: await checkHookInstallStatus(opts),
    };
  }
  if (opts.runtimeId === "codex") {
    if (!opts.participantId || !opts.userParticipantId) {
      throw new Error("participantId and userParticipantId required for codex hooks");
    }
    const applied = await applyCodexHooks(
      opts.participantId,
      opts.userParticipantId,
    );
    return {
      changed: applied.changed,
      configPath: applied.hooksPath,
      status: await checkHookInstallStatus(opts),
    };
  }
  if (opts.runtimeId === "opencode") {
    const opencodeScope: OpencodeHookScope = opts.scope === "global" ? "user" : "project";
    const applied = await applyOpencodeHooks({
      scope: opencodeScope,
      projectRoot: opencodeScope === "project" ? opts.projectRoot : undefined,
    });
    return {
      changed: applied.changed,
      configPath: applied.configPath,
      status: await checkHookInstallStatus(opts),
    };
  }
  throw new Error(`auto-apply is not supported for runtime_id: ${opts.runtimeId}`);
}
