// Probe plugin for F-Mark opencode integration hot-testing.
// Copy to ~/.config/opencode/plugin/probe.ts (or .opencode/plugin/probe.ts) and run opencode.
// Logs every hook call to /tmp/opencode-probe.log (JSONL) for offline analysis.
import type { Plugin } from "@opencode-ai/plugin";
import { appendFile } from "node:fs/promises";

const LOG = "/tmp/opencode-probe.log";

async function log(label: string, payload: unknown): Promise<void> {
  const line = JSON.stringify({ t: new Date().toISOString(), label, payload }) + "\n";
  await appendFile(LOG, line).catch(() => {});
}

export const ProbePlugin: Plugin = async (input) => {
  await log("init", {
    pid: process.pid,
    cwd: process.cwd(),
    directory: input.directory,
    worktree: input.worktree,
    serverUrl: input.serverUrl?.toString?.(),
    env_F_MARK_AGENT_ID: process.env.F_MARK_AGENT_ID ?? null,
    env_F_MARK_PATH: process.env.F_MARK_PATH ?? null,
    env_F_MARK_SESSION_ID: process.env.F_MARK_SESSION_ID ?? null,
  });
  return {
    event: async ({ event }) => { await log("event", event); },
    "chat.message": async (i, o) => { await log("chat.message", { i, parts: o.parts, message: o.message }); },
    "tool.execute.before": async (i, o) => { await log("tool.execute.before", { i, args: o.args }); },
    "tool.execute.after": async (i, o) => { await log("tool.execute.after", { i, output: o.output, metadata: o.metadata, title: o.title }); },
    "permission.ask": async (i, o) => {
      await log("permission.ask:in", { permission: i, currentStatus: o.status });
    },
    "shell.env": async (i, o) => { await log("shell.env", { i, env_keys: Object.keys(o.env || {}) }); },
    "command.execute.before": async (i, o) => { await log("command.execute.before", { i, parts_len: o.parts?.length }); },
  };
};

export default ProbePlugin;
