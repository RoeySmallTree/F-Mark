import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeActiveSession } from "../../../src/agents/activeSession.js";
import { activePaths } from "../../../src/paths/active.js";
import { PathContextRef } from "../../../src/paths/contextRef.js";
import { computePathId } from "../../../src/paths/identity.js";
import { globalPaths } from "../../../src/paths/global.js";
import { registerProjectPath } from "../../../src/paths/registry.js";
import { paths, type Paths } from "../../../src/paths.js";
import { initProject } from "../../../src/project.js";
import { createServer } from "../../../src/server.js";
import { writeGlobalConfig } from "../../../src/state/globalConfig.js";
import { withTempProject } from "../../helpers/tempdir.js";
import type {
  InitializedOtherPathContext,
  OtherActivePathContext,
  ParticipantsApp,
  ParticipantsAppContext,
  RegisteredOtherPathContext,
  UserProfileFixture,
} from "./types.js";

export * from "./assertions.js";
export * from "./fixtures.js";
export * from "./requests.js";
export type * from "./types.js";

export async function withParticipantsApp<T>(
  fn: (context: ParticipantsAppContext) => Promise<T>,
): Promise<T> {
  return withTempProject(async (root) => {
    const projectPaths = await initializedProject(root);
    const { app } = createServer({ token: null, paths: projectPaths });

    return withClosedApp(app, () => fn({ app }));
  });
}

export async function withProfileParticipantsApp<T>(
  userProfile: UserProfileFixture,
  fn: (context: ParticipantsAppContext) => Promise<T>,
): Promise<T> {
  return withTempProject(async (root) => {
    const configRoot = makeTempRoot("fmark-pt-profile-cfg-");
    try {
      const projectPaths = await initializedProject(root);
      const global = globalPaths(configRoot);
      await writeGlobalConfig(global, { userProfile });
      const { app } = createServer({
        token: null,
        paths: projectPaths,
        globalPaths: global,
      });

      return await withClosedApp(app, () => fn({ app }));
    } finally {
      removeTempRoot(configRoot);
    }
  });
}

export async function withFreshActivePathParticipantsApp<T>(
  fn: (context: ParticipantsAppContext) => Promise<T>,
): Promise<T> {
  return withTempProject(async (fallbackRoot) => {
    const activeRoot = makeTempRoot("fmark-pt-fresh-");
    const configRoot = makeTempRoot("fmark-pt-cfg-");
    try {
      const fallback = await initializedProject(fallbackRoot);
      const global = globalPaths(configRoot);
      const active = activePaths(activeRoot);
      const ref = new PathContextRef({ global, active });
      const { app } = createServer({
        token: null,
        paths: fallback,
        pathContextRef: ref,
      });

      return await withClosedApp(app, () => fn({ app }));
    } finally {
      removeTempRoot(activeRoot);
      removeTempRoot(configRoot);
    }
  });
}

export async function withOtherActivePathParticipantsApp<T>(
  fn: (context: OtherActivePathContext) => Promise<T>,
): Promise<T> {
  return withTempProject((fallbackRoot) =>
    withInitializedFallbackAndOther(fallbackRoot, "fmark-pt-other-", (ctx) => {
      const ref = new PathContextRef({
        global: ctx.global,
        active: ctx.otherActive,
      });
      const { app } = createServer({
        token: null,
        paths: ctx.fallback,
        pathContextRef: ref,
      });

      return withClosedApp(app, () => fn(otherPathContext(ctx, app, ref)));
    }),
  );
}

export async function withRegisteredOtherPathParticipantsApp<T>(
  fn: (context: RegisteredOtherPathContext) => Promise<T>,
): Promise<T> {
  return withTempProject((fallbackRoot) =>
    withInitializedFallbackAndOther(
      fallbackRoot,
      "fmark-pt-scoped-",
      async (ctx) => {
        await registerProjectPath(ctx.global, ctx.otherRoot);
        const ref = new PathContextRef({
          global: ctx.global,
          active: activePaths(ctx.fallbackRoot),
        });
        const { app } = createServer({
          token: null,
          paths: ctx.fallback,
          pathContextRef: ref,
        });

        return withClosedApp(app, () => fn(otherPathContext(ctx, app, ref)));
      },
    ),
  );
}

export async function writeAgentActiveSession(
  context: Pick<OtherActivePathContext, "global" | "otherPathId">,
  agentId: string,
  sessionId: string,
): Promise<void> {
  await writeActiveSession(
    context.global.projectAgentsDir(context.otherPathId),
    agentId,
    sessionId,
  );
}

async function initializedProject(root: string): Promise<Paths> {
  const projectPaths = paths(root);
  await initProject(projectPaths);

  return projectPaths;
}

async function withClosedApp<T>(
  app: ParticipantsApp,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } finally {
    await app.close();
  }
}

async function withInitializedFallbackAndOther<T>(
  fallbackRoot: string,
  otherPrefix: string,
  fn: (context: InitializedOtherPathContext) => Promise<T>,
): Promise<T> {
  const otherRoot = makeTempRoot(otherPrefix);
  const configRoot = makeTempRoot("fmark-pt-cfg-");
  try {
    const fallback = await initializedProject(fallbackRoot);
    await initializedProject(otherRoot);
    const global = globalPaths(configRoot);
    const otherActive = activePaths(otherRoot);

    return await fn({
      configRoot,
      fallback,
      fallbackPathId: computePathId(fallbackRoot),
      fallbackRoot,
      global,
      otherActive,
      otherPathId: otherActive.pathId(),
      otherRoot,
    });
  } finally {
    removeTempRoot(otherRoot);
    removeTempRoot(configRoot);
  }
}

function otherPathContext(
  ctx: InitializedOtherPathContext,
  app: ParticipantsApp,
  ref: PathContextRef,
): OtherActivePathContext {
  return {
    app,
    fallbackPathId: ctx.fallbackPathId,
    fallbackRoot: ctx.fallbackRoot,
    global: ctx.global,
    otherActive: ctx.otherActive,
    otherPathId: ctx.otherPathId,
    otherRoot: ctx.otherRoot,
    ref,
  };
}

function makeTempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function removeTempRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
