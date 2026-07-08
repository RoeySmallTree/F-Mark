import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DetectResult, HookEntry, HookLocationStatus } from "./types.js";

export const FMARK_OPENCODE_PLUGIN_VERSION = "phase-opencode-v1";
export type OpencodeHookScope = "project" | "user";

interface SidecarMeta {
  version: string;
  sha256: string;
  scope: OpencodeHookScope;
  installed_at: string;
}

export function opencodePluginPath(scope: OpencodeHookScope, projectRoot?: string): string {
  if (scope === "project") {
    if (projectRoot === undefined) {
      throw new Error("projectRoot required for project scope");
    }
    return join(projectRoot, ".opencode/plugin/fmark.ts");
  }
  return join(homedir(), ".config/opencode/plugin/fmark.ts");
}

function metaPathFor(pluginPath: string): string {
  return join(dirname(pluginPath), "fmark.meta.json");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

function pluginTemplatePath(): string {
  const moduleFile = fileURLToPath(import.meta.url);
  // src/hooksInstall/opencode.ts → packages/kernel/
  const packageRoot = dirname(dirname(dirname(moduleFile)));
  return join(packageRoot, "assets/opencode-plugin/fmark.ts");
}

async function readTemplate(): Promise<string> {
  return readFile(pluginTemplatePath(), "utf8");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function readMeta(pluginPath: string): Promise<SidecarMeta | null> {
  try {
    const raw = await readFile(metaPathFor(pluginPath), "utf8");
    const parsed = JSON.parse(raw) as Partial<SidecarMeta>;
    if (
      typeof parsed.version === "string" &&
      typeof parsed.sha256 === "string" &&
      (parsed.scope === "project" || parsed.scope === "user") &&
      typeof parsed.installed_at === "string"
    ) {
      return parsed as SidecarMeta;
    }
    return null;
  } catch {
    return null;
  }
}

async function detectOneLocation(
  scope: OpencodeHookScope,
  configPath: string,
): Promise<HookLocationStatus> {
  const locationScope: "local" | "global" = scope === "project" ? "local" : "global";
  const expectedTemplate = await readTemplate();
  const expectedVersion = FMARK_OPENCODE_PLUGIN_VERSION;
  const expectedEntries: HookEntry[] = [
    { event: "plugin", command: configPath, version: expectedVersion },
  ];

  let source: string | null = null;
  try {
    source = await readFile(configPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        scope: locationScope,
        configPath,
        exists: false,
        installed: false,
        status: "blocked",
        expectedVersion,
        detectedVersion: null,
        detectedEntries: [],
        expectedEntries,
        error: (err as Error).message,
      };
    }
  }
  if (source === null) {
    return {
      scope: locationScope,
      configPath,
      exists: false,
      installed: false,
      status: "missing",
      expectedVersion,
      detectedVersion: null,
      detectedEntries: [],
      expectedEntries,
    };
  }

  const meta = await readMeta(configPath);
  const detectedVersion = meta?.version ?? null;
  const fileHash = sha256(source);
  const expectedHash = sha256(expectedTemplate);
  const installed =
    meta !== null &&
    meta.version === expectedVersion &&
    meta.sha256 === fileHash &&
    fileHash === expectedHash;

  return {
    scope: locationScope,
    configPath,
    exists: true,
    installed,
    status: installed ? "installed" : "stale",
    expectedVersion,
    detectedVersion,
    detectedEntries: [
      {
        event: "plugin",
        command: configPath,
        version: detectedVersion ?? undefined,
      },
    ],
    expectedEntries,
  };
}

export async function detectOpencodeHooks(opts: {
  projectRoot?: string;
}): Promise<DetectResult> {
  const userLoc = await detectOneLocation("user", opencodePluginPath("user"));
  const locations: HookLocationStatus[] = [];
  if (opts.projectRoot !== undefined) {
    const projectLoc = await detectOneLocation(
      "project",
      opencodePluginPath("project", opts.projectRoot),
    );
    locations.push(projectLoc);
  }
  locations.push(userLoc);

  const aggregate = locations.find((l) => l.installed) ?? locations[0]!;
  return {
    installed: locations.some((l) => l.installed),
    status: aggregate.status,
    configPath: aggregate.configPath,
    expectedVersion: FMARK_OPENCODE_PLUGIN_VERSION,
    detectedVersion: aggregate.detectedVersion,
    detectedEntries: locations.flatMap((l) => l.detectedEntries),
    expectedEntries: aggregate.expectedEntries,
    locations,
  };
}

export async function loadOpencodePluginFile(opts: {
  scope: OpencodeHookScope;
  projectRoot?: string;
}): Promise<{ source: string | null; configPath: string }> {
  const configPath = opencodePluginPath(opts.scope, opts.projectRoot);
  try {
    return { configPath, source: await readFile(configPath, "utf8") };
  } catch {
    return { configPath, source: null };
  }
}

export async function applyOpencodeHooks(opts: {
  scope: OpencodeHookScope;
  projectRoot?: string;
}): Promise<{ changed: boolean; configPath: string }> {
  const configPath = opencodePluginPath(opts.scope, opts.projectRoot);
  const template = await readTemplate();
  const expectedHash = sha256(template);

  let existing: string | null = null;
  try {
    existing = await readFile(configPath, "utf8");
  } catch {
    /* missing */
  }
  const existingMeta = await readMeta(configPath);
  const upToDate =
    existing === template &&
    existingMeta?.version === FMARK_OPENCODE_PLUGIN_VERSION &&
    existingMeta?.sha256 === expectedHash;
  if (upToDate) return { changed: false, configPath };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, template, "utf8");
  const meta: SidecarMeta = {
    version: FMARK_OPENCODE_PLUGIN_VERSION,
    sha256: expectedHash,
    scope: opts.scope,
    installed_at: new Date().toISOString(),
  };
  await writeFile(metaPathFor(configPath), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return { changed: true, configPath };
}

export async function removeOpencodeHooks(opts: {
  scope: OpencodeHookScope;
  projectRoot?: string;
}): Promise<{ changed: boolean; configPath: string }> {
  const configPath = opencodePluginPath(opts.scope, opts.projectRoot);
  const sidecarPath = metaPathFor(configPath);
  const [pluginExisted, sidecarExisted] = await Promise.all([
    pathExists(configPath),
    pathExists(sidecarPath),
  ]);
  await Promise.all([
    rm(configPath, { force: true }),
    rm(sidecarPath, { force: true }),
  ]);
  return { changed: pluginExisted || sidecarExisted, configPath };
}

export function renderOpencodeInstallSnippet(): string {
  return [
    "F-Mark installs an opencode plugin to capture session events.",
    "",
    "Auto-apply: `f-mark integration apply --runtime opencode --scope project|user`",
    "writes `.opencode/plugin/fmark.ts` plus a sidecar `fmark.meta.json` whose",
    "sha256 + version detect drift.",
    "",
    "```typescript",
    "// see packages/kernel/assets/opencode-plugin/fmark.ts for the canonical template",
    `// version: ${FMARK_OPENCODE_PLUGIN_VERSION}`,
    "// export const FmarkPlugin: Plugin = async (input) => { /* ... */ };",
    "```",
  ].join("\n");
}
