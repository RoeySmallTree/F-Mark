import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { codexConfigPath, codexHooksPath } from "./paths.js";

export async function loadCodexConfig(
  projectRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  toml: string;
  hooksJson: string;
  configPath: string;
}> {
  const parts: string[] = [];
  try {
    parts.push(await readFile(codexConfigPath(env), "utf8"));
  } catch {
    // user-level config missing is fine
  }
  if (projectRoot) {
    try {
      parts.push(await readFile(join(projectRoot, ".codex", "config.toml"), "utf8"));
    } catch {
      // project-local config missing is fine
    }
  }
  let hooksJson = "";
  try {
    hooksJson = await readFile(codexHooksPath(env), "utf8");
  } catch {
    // hooks.json missing is fine
  }
  return {
    toml: parts.join("\n"),
    hooksJson,
    configPath: codexHooksPath(env),
  };
}
