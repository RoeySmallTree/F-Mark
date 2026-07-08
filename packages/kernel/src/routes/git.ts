/* Read-only git diff routes (design §8, X5, X6). Every endpoint takes a
   required root scope (`path_id`|`root`) — there is no active-root fallback.
   Hunk/file revert is the one mutating surface and still recomputes server
   hunks before applying anything client-requested. */

import type { FastifyInstance } from "fastify";
import { createGitMutator, type GitMutator } from "../git/revert.js";
import { createGitService, type GitService } from "../git/service.js";
import type { Paths } from "../paths.js";
import type { PathDeps } from "./pathDeps.js";
import { GitBlobVersionRoute } from "./git/blobRoute.js";
import { GitRouteContext } from "./git/context.js";
import { GitTextFileReader } from "./git/content.js";
import { GitChangeSetService, GitHunkComputer } from "./git/hunks.js";
import {
  GitChangedFilesRoute,
  GitDiffRoute,
  GitFileVersionRoute,
} from "./git/readRoutes.js";
import { GitBranchRefsRoute, GitDiffSettingsRoute } from "./git/settingsRoute.js";
import { GitRevertHunkRoute } from "./git/revertRoute.js";

interface GitRouteDeps {
  git: GitService;
  mutator: GitMutator;
}

export function registerGitRoutes(
  app: FastifyInstance,
  depsArg: Paths | PathDeps,
  routeDeps: Partial<GitRouteDeps> = {},
): void {
  const git = routeDeps.git ?? createGitService();
  const mutator = routeDeps.mutator ?? createGitMutator();
  const context = new GitRouteContext(depsArg, git);
  const textReader = new GitTextFileReader();
  const changes = new GitChangeSetService(git);
  const hunks = new GitHunkComputer(git, textReader);
  const changedFiles = new GitChangedFilesRoute(context, changes);
  const diff = new GitDiffRoute(context, changes, hunks);
  const fileVersion = new GitFileVersionRoute(context, git, changes, textReader);
  const blobVersion = new GitBlobVersionRoute(context, git, changes);
  const branchRefs = new GitBranchRefsRoute(context, git);
  const diffSettings = new GitDiffSettingsRoute(context, git);
  const revertHunk = new GitRevertHunkRoute(
    context,
    mutator,
    changes,
    hunks,
  );

  app.get<{
    Querystring: {
      path_id?: string;
      root?: string;
      session_id?: string;
      base?: string;
      mode?: string;
    };
  }>("/git/changed-files", (req, reply) =>
    logGitRoute("GET /git/changed-files", req.query, () =>
      changedFiles.handle(req.query, reply),
    ),
  );

  app.get<{
    Querystring: {
      path_id?: string;
      root?: string;
      session_id?: string;
      rel_path?: string;
      base?: string;
      mode?: string;
    };
  }>("/git/diff", (req, reply) =>
    logGitRoute("GET /git/diff", req.query, () => diff.handle(req.query, reply)),
  );

  app.get<{
    Querystring: {
      path_id?: string;
      root?: string;
      session_id?: string;
      rel_path?: string;
      base?: string;
      mode?: string;
    };
  }>("/git/file-version", (req, reply) =>
    logGitRoute("GET /git/file-version", req.query, () =>
      fileVersion.handle(req.query, reply),
    ),
  );

  app.get<{
    Querystring: {
      path_id?: string;
      root?: string;
      rel_path?: string;
      version?: string;
      base?: string;
      mode?: string;
    };
  }>("/git/blob-version", (req, reply) =>
    logGitRoute("GET /git/blob-version", req.query, () =>
      blobVersion.handle(req.query, req.headers.range, reply),
    ),
  );

  app.get<{ Querystring: { path_id?: string; root?: string } }>(
    "/git/branches",
    (req, reply) =>
      logGitRoute("GET /git/branches", req.query, () =>
        branchRefs.get(req.query, reply),
      ),
  );

  app.get<{ Querystring: { path_id?: string; root?: string } }>(
    "/git/diff-settings",
    (req, reply) =>
      logGitRoute("GET /git/diff-settings", req.query, () =>
        diffSettings.get(req.query, reply),
      ),
  );

  app.put<{ Body: { path_id?: string; diff_base_ref_override?: string | null } }>(
    "/git/diff-settings",
    (req, reply) => diffSettings.put(req.body, reply),
  );

  app.post<{
    Body: {
      path_id?: string;
      root?: string;
      session_id?: string;
      rel_path?: string;
      mode?: string;
      base?: string;
      hunk_id?: string;
      action?: string;
      old_path?: string;
    };
  }>("/git/revert-hunk", (req, reply) => revertHunk.handle(req.body, reply));
}

async function logGitRoute<T>(
  route: string,
  scope: {
    path_id?: string;
    root?: string;
    rel_path?: string;
    session_id?: string;
    mode?: string;
    base?: string;
  },
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    return result;
  } catch (error) {
    throw error;
  }
}
