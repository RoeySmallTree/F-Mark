import { readFile } from "node:fs/promises";
import { claudeConfigPath } from "./claude/paths.js";

export type { ClaudeHookScope } from "./claude/paths.js";
export { claudeConfigPath };
export {
  detectClaudeHookLocations,
  detectClaudeHooks,
} from "./claude/detector.js";
export {
  applyClaudeHooks,
  removeClaudeFmarkHooks,
} from "./claude/installer.js";
export {
  renderClaudeInstallPrompt,
  renderClaudeInstallSnippet,
} from "./claude/render.js";

export async function loadClaudeSettings(
  configPath = claudeConfigPath(),
): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    return null;
  }
}
