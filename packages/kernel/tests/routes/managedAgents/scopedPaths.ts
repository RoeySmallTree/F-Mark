import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../../src/routes/managedAgents.js";
import { initProject } from "../../../src/project.js";
import { paths } from "../../../src/paths.js";
import { activePaths } from "../../../src/paths/active.js";
import { globalPaths } from "../../../src/paths/global.js";
import { PathContextRef } from "../../../src/paths/contextRef.js";
import { registerProjectPath } from "../../../src/paths/registry.js";
import { createPresenceTracker } from "../../../src/presence/tracker.js";
import { fakeCommandRunner } from "../../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../../src/tmux/manager.js";
import { createInputQueue } from "../../../src/tmux/inputQueue.js";
import type { Bus } from "../../../src/ws/bus.js";
import type { FakeRunner, ProjectPaths } from "./fixtures.js";

type ScopedRoots = {
  fallbackRoot: string;
  activeRoot: string;
  configRoot: string;
  fallback: ProjectPaths;
  active: ProjectPaths;
  global: ReturnType<typeof globalPaths>;
  ref: PathContextRef;
};

async function initBaseScopedRoots(
  fallbackRoot: string,
  activeRoot: string,
  configRoot: string,
): Promise<Omit<ScopedRoots, "ref">> {
  const fallback = paths(fallbackRoot);
  const active = paths(activeRoot);
  await initProject(fallback);
  await initProject(active);
  return {
    fallbackRoot,
    activeRoot,
    configRoot,
    fallback,
    active,
    global: globalPaths(configRoot),
  };
}

async function createBaseScopedRoots(
  prefix: string,
): Promise<Omit<ScopedRoots, "ref">> {
  const fallbackRoot = await mkdtemp(join(tmpdir(), `${prefix}-fb-`));
  const activeRoot = await mkdtemp(join(tmpdir(), `${prefix}-active-`));
  const configRoot = await mkdtemp(join(tmpdir(), `${prefix}-cfg-`));
  try {
    return await initBaseScopedRoots(fallbackRoot, activeRoot, configRoot);
  } catch (error) {
    await cleanupBaseScopedRoots({ fallbackRoot, activeRoot, configRoot });
    throw error;
  }
}

async function cleanupBaseScopedRoots(roots: {
  fallbackRoot: string;
  activeRoot: string;
  configRoot: string;
}): Promise<void> {
  await rm(roots.fallbackRoot, { recursive: true, force: true });
  await rm(roots.activeRoot, { recursive: true, force: true });
  await rm(roots.configRoot, { recursive: true, force: true });
}

export async function withActivePathFixture<T>(
  prefix: string,
  run: (ctx: ScopedRoots & { activePath: ReturnType<typeof activePaths> }) => Promise<T>,
): Promise<T> {
  const base = await createBaseScopedRoots(prefix);
  try {
    const activePath = activePaths(base.activeRoot);
    const ref = new PathContextRef({ global: base.global, active: activePath });
    return await run({
      ...base,
      activePath,
      ref,
    });
  } finally {
    await cleanupBaseScopedRoots(base);
  }
}

export async function withBackgroundPathFixture<T>(
  prefix: string,
  run: (
    ctx: ScopedRoots & {
      backgroundRoot: string;
      background: ProjectPaths;
      backgroundPath: ReturnType<typeof activePaths>;
    },
  ) => Promise<T>,
): Promise<T> {
  const base = await createBaseScopedRoots(prefix);
  const backgroundRoot = await mkdtemp(join(tmpdir(), `${prefix}-bg-`));
  try {
    const background = paths(backgroundRoot);
    await initProject(background);
    await registerProjectPath(base.global, backgroundRoot);
    const backgroundPath = activePaths(backgroundRoot);
    const ref = new PathContextRef({
      global: base.global,
      active: activePaths(base.activeRoot),
    });
    return await run({
      ...base,
      backgroundRoot,
      background,
      backgroundPath,
      ref,
    });
  } finally {
    await cleanupBaseScopedRoots(base);
    await rm(backgroundRoot, { recursive: true, force: true });
  }
}

export function makeScopedManagedAgentsApp({
  fallback,
  activeRoot,
  ref,
  runner = fakeCommandRunner(),
  bus = { publish: () => {} },
}: {
  fallback: ProjectPaths;
  activeRoot: string;
  ref: PathContextRef;
  runner?: FakeRunner;
  bus?: Bus;
}): { app: FastifyInstance; runner: FakeRunner } {
  const app = Fastify();
  registerManagedAgentsRoutes(app, {
    paths: fallback,
    tmux: createTmuxManager({ runner, projectRoot: activeRoot }),
    tracker: createPresenceTracker({ broadcast: () => {} }),
    projectRoot: activeRoot,
    inputQueue: createInputQueue(),
    bus,
    pathContextRef: ref,
  });
  return { app, runner };
}
