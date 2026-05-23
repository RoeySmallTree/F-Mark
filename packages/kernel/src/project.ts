import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Paths } from "./paths.js";
import { initRuntimesFile } from "./runtimes/registry.js";

export interface ProjectConfig {
  version: string;
  port: number;
  participants: Record<string, Participant>;
}

export interface Participant {
  kind: "user" | "agent";
  name: string;
  color: string;
  runtime_id?: string;
}

const DEFAULT_VERSION = "0.1.0";
const DEFAULT_PORT = 7777;
const USER_COLOR = "#3b82f6";

function shortId(prefix: "us" | "ag"): string {
  return `${prefix}-${randomBytes(2).toString("hex")}`;
}

function defaultConfig(): ProjectConfig {
  const id = shortId("us");
  return {
    version: DEFAULT_VERSION,
    port: DEFAULT_PORT,
    participants: {
      [id]: { kind: "user", name: "You", color: USER_COLOR },
    },
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

function assetsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
}

export async function initProject(p: Paths): Promise<void> {
  await mkdir(p.fmarkDir(), { recursive: true });
  await mkdir(p.sessionsDir(), { recursive: true });
  if (!(await exists(p.configFile()))) {
    await writeFile(p.configFile(), JSON.stringify(defaultConfig(), null, 2));
  }
  if (!(await exists(p.agentMd()))) {
    const template = await readFile(join(assetsDir(), "AGENT.md"), "utf8");
    await writeFile(p.agentMd(), template);
  }
  await initRuntimesFile(p.fmarkDir());
}

export async function readConfig(p: Paths): Promise<ProjectConfig> {
  return JSON.parse(await readFile(p.configFile(), "utf8")) as ProjectConfig;
}

export async function writeConfig(p: Paths, config: ProjectConfig): Promise<void> {
  await writeFile(p.configFile(), JSON.stringify(config, null, 2));
}
