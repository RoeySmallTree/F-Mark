import { homedir } from "node:os";
import { join } from "node:path";

export function codexConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(codexHome(env), "config.toml");
}

export function codexHooksPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(codexHome(env), "hooks.json");
}

function codexHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME ?? join(env.HOME ?? homedir(), ".codex");
}
