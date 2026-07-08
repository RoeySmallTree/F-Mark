import { describe, expect, it } from "vitest";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createServer } from "../../../src/server.js";
import { initProject } from "../../../src/project.js";
import { listParticipants } from "../../../src/participants.js";
import { createSession } from "../../../src/sessions.js";
import { paths } from "../../../src/paths.js";
import { activePaths } from "../../../src/paths/active.js";
import { registerProjectPath } from "../../../src/paths/registry.js";
import { computePathId } from "../../../src/paths/identity.js";
import { readState } from "../../../src/state/store.js";
import { withTempProject } from "../../helpers/tempdir.js";
import {
  createPathContext,
  createSessionWithProse,
  expectSessionDirExists,
  getAllSessions,
  proseContentsFromGroups,
  withFallbackAndOtherRouteSessionApp,
  withPathContextSessionApp,
  withRegisteredPathSessionApp,
  withTempPathContextSessionApp,
  withTempRoots,
  withTempSessionApp,
  writeProseEvent,
} from "./helpers.js";

export function registerMultiPathSessionRouteTests(): void {
  describe("multi-path body.path", () => {
    registerPathCreationTests();
    registerAllSessionListTests();
    registerAllSessionEventTests();
    registerIncrementalCursorTests();
    registerEmptyProjectTests();
  });
}

function registerPathCreationTests(): void {
  it(
    "creates a session at the chosen path without activating it",
    createsSessionAtChosenPathWithoutActivatingIt,
  );
  it(
    "mirrors the kernel auth token into newly-created project paths",
    mirrorsKernelAuthTokenIntoNewProjectPath,
  );
  it("400s when body.path doesn't exist", rejectsMissingBodyPath);
}

function registerAllSessionListTests(): void {
  it(
    "GET /sessions can read an explicitly scoped path after creation",
    readsExplicitlyScopedPathAfterCreation,
  );
  it(
    "GET /sessions?scope=all lists sessions across known paths",
    listsSessionsAcrossKnownPaths,
  );
  it(
    "GET /sessions?scope=all includes registered project paths",
    listsRegisteredProjectPaths,
  );
}

function registerAllSessionEventTests(): void {
  it(
    "GET /sessions/events?scope=all returns events grouped with path metadata",
    returnsEventsGroupedWithPathMetadata,
  );
  it(
    "GET /sessions/events?scope=all supports stateless since filtering",
    supportsStatelessSinceFiltering,
  );
}

function registerIncrementalCursorTests(): void {
  it(
    "GET /sessions/events?scope=all&incremental=1 writes global cursors and then returns only later events",
    writesGlobalCursorsAndThenReturnsOnlyLaterEvents,
  );
  it(
    "keeps incremental cursors separate for unfiltered and sorted kind filters",
    keepsIncrementalCursorsSeparateForKindFilters,
  );
  it(
    "backfills a newly registered root with no per-session cursor",
    backfillsNewlyRegisteredRootWithNoPerSessionCursor,
  );
  it(
    "does not move an existing cursor backward during a stale incremental write",
    doesNotMoveExistingCursorBackward,
  );
  it(
    "rejects incremental all-events when the global config is malformed",
    rejectsMalformedGlobalCursorConfig,
  );
  it(
    "rejects requests that combine since and incremental",
    rejectsSinceAndIncrementalTogether,
  );
}

function registerEmptyProjectTests(): void {
  it(
    "GET /sessions returns [] when active path has no .f-mark/",
    returnsEmptySessionsForFreshActivePath,
  );
}

async function createsSessionAtChosenPathWithoutActivatingIt(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withTempRoots(
      ["fmark-other-", "fmark-cfg-"],
      async ([otherRoot, configRoot]) => {
        await withPathContextSessionApp(
          fallbackRoot,
          configRoot,
          async ({ app, g, ref }) => {
            const res = await app.inject({
              method: "POST",
              url: "/sessions",
              payload: { slug: "alt", path: otherRoot },
            });
            expect(res.statusCode).toBe(200);
            const meta = res.json();
            expect(meta.id).toMatch(/-alt$/);
            expectSessionDirExists(otherRoot, meta.id, true);
            expectSessionDirExists(fallbackRoot, meta.id, false);
            expectNewProjectFiles(otherRoot);
            expect(ref.get().active?.root()).toBe(fallbackRoot);
            const state = await readState(g);
            expect(state.activePath).toBe(null);
            expect(state.knownPaths).toContain(otherRoot);
            expect(ref.revision()).toBe(0);
            await expectProjectHasUserParticipant(otherRoot);
          },
        );
      },
    );
  });
}

async function mirrorsKernelAuthTokenIntoNewProjectPath(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withTempRoots(
      ["fmark-other-auth-", "fmark-cfg-"],
      async ([otherRoot, configRoot]) => {
        await withPathContextSessionApp(
          fallbackRoot,
          configRoot,
          async ({ app }) => {
            const res = await app.inject({
              method: "POST",
              url: "/sessions",
              headers: { authorization: "Bearer secret" },
              payload: { slug: "alt", path: otherRoot },
            });

            expect(res.statusCode).toBe(200);
            const tokenPath = join(otherRoot, ".f-mark", ".token");
            expect(readFileSync(tokenPath, "utf8")).toBe("secret");
            expect(statSync(tokenPath).mode & 0o777).toBe(0o600);
          },
          { token: "secret" },
        );
      },
    );
  });
}

async function rejectsMissingBodyPath(): Promise<void> {
  await withTempProject(async (root) => {
    await withTempRoots(["fmark-cfg-"], async ([configRoot]) => {
      await withPathContextSessionApp(root, configRoot, async ({ app }) => {
        const res = await app.inject({
          method: "POST",
          url: "/sessions",
          payload: { slug: "x", path: "/nope/does/not/exist" },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("PATH_NOT_FOUND");
      });
    });
  });
}

async function readsExplicitlyScopedPathAfterCreation(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withFallbackAndOtherRouteSessionApp(
      fallbackRoot,
      async ({ app, otherRoot }) => {
        const res = await app.inject({
          method: "GET",
          url: `/sessions?path_id=${computePathId(otherRoot)}`,
        });
        const ids = res.json().sessions.map((s: { id: string }) => s.id);
        expect(ids.some((id: string) => id.endsWith("-other-session"))).toBe(true);
        expect(ids.some((id: string) => id.endsWith("-fallback-session"))).toBe(
          false,
        );
      },
    );
  });
}

async function listsSessionsAcrossKnownPaths(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withFallbackAndOtherRouteSessionApp(
      fallbackRoot,
      async ({ app, otherRoot }) => {
        const sessions = await getAllSessions(app);
        const fallback = sessions.find((s) => s.id.endsWith("-fallback-session"));
        const other = sessions.find((s) => s.id.endsWith("-other-session"));
        expect(fallback?.path).toBe(fallbackRoot);
        expect(fallback?.path_id).toBe(activePaths(fallbackRoot).pathId());
        expect(other?.path).toBe(otherRoot);
        expect(other?.path_id).toBe(activePaths(otherRoot).pathId());
      },
    );
  });
}

async function listsRegisteredProjectPaths(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withTempRoots(
      ["fmark-registered-", "fmark-cfg-"],
      async ([otherRoot, configRoot]) => {
        await withRegisteredPathSessionApp(
          fallbackRoot,
          configRoot,
          otherRoot,
          async ({ app, p, otherPaths }) => {
            await createSession(p, { slug: "fallback-session" });
            await createSession(otherPaths, { slug: "registered-session" });

            const sessions = await getAllSessions(app);
            expect(
              sessions.some(
                (s) =>
                  s.id.endsWith("-registered-session") && s.path === otherRoot,
              ),
            ).toBe(true);
          },
        );
      },
    );
  });
}

async function returnsEventsGroupedWithPathMetadata(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withTempRoots(
      ["fmark-events-", "fmark-cfg-"],
      async ([otherRoot, configRoot]) => {
        await withRegisteredPathSessionApp(
          fallbackRoot,
          configRoot,
          otherRoot,
          async ({ app, p, otherPaths }) => {
            await createSessionWithProse(p, "fallback-session", [
              { content: "fallback body" },
            ]);
            const { session: other } = await createSessionWithProse(
              otherPaths,
              "other-session",
              [{ content: "other body" }],
            );

            const res = await app.inject({
              method: "GET",
              url: "/sessions/events?scope=all&kinds=prose",
            });
            expect(res.statusCode).toBe(200);
            expectEventGroupWithContent(res.json(), {
              path: otherRoot,
              sessionId: other.id,
              content: "other body",
            });
          },
        );
      },
    );
  });
}

async function supportsStatelessSinceFiltering(): Promise<void> {
  await withTempSessionApp(async ({ app, p }) => {
    await createSessionWithProse(p, "since-session", [
      {
        content: "before cursor",
        timestamp: "20200101T000000.000Z",
      },
      {
        content: "after cursor",
        timestamp: "20200101T000001.000Z",
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&kinds=prose&since=20200101T000000.000Z",
    });

    expect(res.statusCode).toBe(200);
    const contents = proseContentsFromGroups(res.json());
    expect(contents).toEqual(["after cursor"]);
  });
}

async function writesGlobalCursorsAndThenReturnsOnlyLaterEvents(): Promise<void> {
  await withTempPathContextSessionApp(async ({ app, g, p, root }) => {
    const { participantId, session } = await createSessionWithProse(
      p,
      "incremental-session",
      [
        {
          content: "initial body",
          timestamp: "20200101T000000.000Z",
        },
      ],
    );

    const first = await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&incremental=1",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().mode).toBe("incremental");
    expect(first.json().cursor.key).toBe("scope=all;kinds=*");
    expectEventResponseContains(first.json(), "initial body");
    expectStoredCursorPath(g.configFile(), first.json(), root);

    await writeProseEvent(p, session.id, "later body", { participantId });

    const second = await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&incremental=1",
    });
    expect(second.statusCode).toBe(200);
    const contents = proseContentsFromGroups(second.json());
    expect(contents).toContain("later body");
    expect(contents).not.toContain("initial body");
  });
}

async function keepsIncrementalCursorsSeparateForKindFilters(): Promise<void> {
  await withTempPathContextSessionApp(async ({ app, g, p }) => {
    await createSessionWithProse(p, "kinds-session", [
      {
        content: "kind body",
        timestamp: "20200101T000000.000Z",
      },
    ]);

    await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&incremental=1",
    });
    await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&kinds=todo,prose&incremental=1",
    });

    const rawConfig = readJsonFile(g.configFile());
    expect(Object.keys(rawConfig.allSessionEvents.cursors).sort()).toEqual([
      "scope=all;kinds=*",
      "scope=all;kinds=prose,todo",
    ]);
  });
}

async function backfillsNewlyRegisteredRootWithNoPerSessionCursor(): Promise<void> {
  await withTempProject(async (fallbackRoot) => {
    await withTempRoots(
      ["fmark-new-root-", "fmark-cfg-"],
      async ([otherRoot, configRoot]) => {
        const { app, g } = await createBackfillCursorApp(
          fallbackRoot,
          otherRoot,
          configRoot,
        );
        try {
          await app.inject({
            method: "GET",
            url: "/sessions/events?scope=all&incremental=1",
          });
          await registerProjectPath(g, otherRoot);

          const res = await app.inject({
            method: "GET",
            url: "/sessions/events?scope=all&incremental=1",
          });

          expect(res.statusCode).toBe(200);
          expectEventGroupWithContent(res.json(), {
            path: otherRoot,
            content: "other backfill",
          });
        } finally {
          await app.close();
        }
      },
    );
  });
}

async function doesNotMoveExistingCursorBackward(): Promise<void> {
  await withTempPathContextSessionApp(async ({ app, g, p, root }) => {
    const session = await createSession(p, { slug: "stale-session" });
    const pathId = computePathId(root);
    const sessionKey = `${pathId}/${session.id}`;
    writeStaleCursorConfig(g.configFile(), {
      pathId,
      root,
      sessionId: session.id,
      sessionKey,
    });

    const res = await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&incremental=1",
    });

    expect(res.statusCode).toBe(200);
    const rawConfig = readJsonFile(g.configFile());
    expect(
      rawConfig.allSessionEvents.cursors["scope=all;kinds=*"].sessions[
        sessionKey
      ].last_checked_at,
    ).toBe("20990101T000000.000Z");
  });
}

async function rejectsMalformedGlobalCursorConfig(): Promise<void> {
  await withTempPathContextSessionApp(async ({ app, g, p }) => {
    await createSession(p, { slug: "bad-config-session" });
    writeFileSync(g.configFile(), "{bad-json", "utf8");

    const res = await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&incremental=1",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("failed to read all-session event cursor");
  });
}

async function rejectsSinceAndIncrementalTogether(): Promise<void> {
  await withTempSessionApp(async ({ app }) => {
    const res = await app.inject({
      method: "GET",
      url: "/sessions/events?scope=all&since=20200101T000000.000Z&incremental=1",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/mutually exclusive/);
  });
}

async function returnsEmptySessionsForFreshActivePath(): Promise<void> {
  await withTempRoots(
    ["fmark-fresh-", "fmark-cfg-"],
    async ([fresh, configRoot]) => {
      const p = paths(fresh);
      // Note: NO initProject - fresh dir has no .f-mark/.
      const { ref } = createPathContext(fresh, configRoot);
      const { app } = createServer({
        token: null,
        paths: p,
        pathContextRef: ref,
      });
      try {
        const res = await app.inject({ method: "GET", url: "/sessions" });
        expect(res.statusCode).toBe(200);
        expect(res.json().sessions).toEqual([]);
        // listSessions must NOT have created .f-mark/ in the fresh dir.
        expect(existsSync(join(fresh, ".f-mark"))).toBe(false);
      } finally {
        await app.close();
      }
    },
  );
}

function expectNewProjectFiles(root: string): void {
  // The newly selected path is a complete F-Mark project, not a
  // half-created sessions-only tree.
  expect(existsSync(join(root, ".f-mark", "AGENT.md"))).toBe(true);
  expect(existsSync(join(root, ".f-mark", "config.json"))).toBe(true);
  expect(existsSync(join(root, ".f-mark", "runtimes.json"))).toBe(true);
  const config = readJsonFile(join(root, ".f-mark", "config.json"));
  expect(config.port).toBe(7777);
}

async function expectProjectHasUserParticipant(root: string): Promise<void> {
  const participants = await listParticipants(paths(root));
  expect(Object.values(participants).some((part) => part.kind === "user")).toBe(
    true,
  );
}

function expectEventGroupWithContent(
  body: {
    groups: Array<{
      path: string;
      session: { id: string };
      events: Array<{ payload: { content: string } }>;
    }>;
  },
  expected: { path: string; sessionId?: string; content: string },
): void {
  expect(
    body.groups.some(
      (group) =>
        group.path === expected.path &&
        (expected.sessionId === undefined ||
          group.session.id === expected.sessionId) &&
        group.events.some((event) => event.payload.content === expected.content),
    ),
  ).toBe(true);
}

function expectEventResponseContains(
  body: { groups: Array<{ events: Array<{ payload: { content: string } }> }> },
  content: string,
): void {
  expect(
    body.groups.some((group) =>
      group.events.some((event) => event.payload.content === content),
    ),
  ).toBe(true);
}

function expectStoredCursorPath(
  configFile: string,
  body: { groups: Array<{ path_id: string; session: { id: string } }> },
  root: string,
): void {
  const rawConfig = readJsonFile(configFile);
  const group = body.groups[0]!;
  const cursorKey = `${group.path_id}/${group.session.id}`;
  expect(
    rawConfig.allSessionEvents.cursors["scope=all;kinds=*"].sessions[cursorKey]
      .path,
  ).toBe(root);
}

async function createBackfillCursorApp(
  fallbackRoot: string,
  otherRoot: string,
  configRoot: string,
) {
  const p = paths(fallbackRoot);
  await initProject(p);
  await createSession(p, { slug: "fallback-session" });
  const otherPaths = paths(otherRoot);
  await initProject(otherPaths);
  await createSessionWithProse(otherPaths, "other-session", [
    {
      content: "other backfill",
      timestamp: "20200101T000000.000Z",
    },
  ]);

  const { g, ref } = createPathContext(fallbackRoot, configRoot);
  const { app } = createServer({
    token: null,
    paths: p,
    pathContextRef: ref,
  });
  return { app, g };
}

function writeStaleCursorConfig(
  configFile: string,
  input: {
    pathId: string;
    root: string;
    sessionId: string;
    sessionKey: string;
  },
): void {
  writeFileSync(
    configFile,
    JSON.stringify(
      {
        allSessionEvents: {
          schema: 1,
          cursors: {
            "scope=all;kinds=*": {
              updated_at: "20990101T000000.000Z",
              sessions: {
                [input.sessionKey]: {
                  path_id: input.pathId,
                  path: input.root,
                  session_id: input.sessionId,
                  last_checked_at: "20990101T000000.000Z",
                },
              },
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

function readJsonFile(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}
