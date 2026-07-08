import {
  applyClaudeHooks,
  detectClaudeHookLocations,
  removeClaudeFmarkHooks,
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
  removeOpencodeHooks,
  renderOpencodeInstallSnippet,
  type OpencodeHookScope,
} from "./opencode.js";
import type { HookInstallScope } from "@f-mark/shared";
import type { DetectResult } from "./types.js";

export async function checkHookInstallStatus(opts: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<DetectResult> {
  const userId = opts.userParticipantId ?? "us-unknown";
  if (opts.runtimeId === "claude") {
    return detectClaudeHookLocations({
      projectRoot: opts.projectRoot,
    });
  }
  if (opts.runtimeId === "codex") {
    const toml = await loadCodexConfig(opts.projectRoot, opts.env);
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

export async function applyAutomaticHookInstall(opts: {
  runtimeId: string;
  participantId?: string;
  userParticipantId?: string;
  projectRoot?: string;
  scope?: ClaudeHookScope;
  env?: NodeJS.ProcessEnv;
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
    const applied = await applyCodexHooks(
      opts.participantId,
      opts.userParticipantId,
      opts.env,
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

export async function reconcileHookScopes(opts: {
  runtimeId: string;
  chosenHookScope: HookInstallScope;
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ removed: { scope: HookInstallScope; configPath: string }[] }> {
  const otherScope: HookInstallScope =
    opts.chosenHookScope === "global" ? "local" : "global";
  const removed: { scope: HookInstallScope; configPath: string }[] = [];

  if (opts.runtimeId === "claude") {
    if (otherScope === "local" && opts.projectRoot === undefined) {
      return { removed };
    }
    const result = await removeClaudeFmarkHooks({
      scope: otherScope,
      projectRoot: opts.projectRoot,
    });
    if (result.changed) {
      removed.push({ scope: otherScope, configPath: result.configPath });
    }
    return { removed };
  }

  if (opts.runtimeId === "opencode") {
    const opencodeScope: OpencodeHookScope =
      otherScope === "global" ? "user" : "project";
    if (opencodeScope === "project" && opts.projectRoot === undefined) {
      return { removed };
    }
    const result = await removeOpencodeHooks({
      scope: opencodeScope,
      projectRoot: opencodeScope === "project" ? opts.projectRoot : undefined,
    });
    if (result.changed) {
      removed.push({ scope: otherScope, configPath: result.configPath });
    }
    return { removed };
  }

  return { removed };
}
