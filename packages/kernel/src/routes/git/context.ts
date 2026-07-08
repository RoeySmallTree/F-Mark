import type { FastifyReply } from "fastify";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { isSafeRef, resolveBase, type GitResolvedBase, type GitService } from "../../git/service.js";
import type { Paths } from "../../paths.js";
import { readConfig } from "../../project.js";
import { normaliseDeps, type PathDeps } from "../pathDeps.js";
import {
  projectRootGuard,
  resolveKnownRootScope,
  type KnownRoot,
} from "../rootScope.js";
import type { GitDiffMode } from "@f-mark/shared";

export interface RootScopeQuery {
  path_id?: string;
  root?: string;
}

export interface BaseRefQuery extends RootScopeQuery {
  base?: string;
  mode?: string;
  session_id?: string;
}

export interface RelPathQuery extends BaseRefQuery {
  rel_path?: string;
}

export interface CheckedRelPath {
  abs: string;
  rel: string;
}

export function modeFromQuery(raw: string | undefined): GitDiffMode {
  return raw === "branch" || raw === "whole-branch" ? "branch" : "session";
}

export async function savedOverride(paths: Paths): Promise<string | null> {
  try {
    const cfg = await readConfig(paths);
    return cfg.git?.diff_base_ref_override ?? null;
  } catch {
    return null;
  }
}

class GitPathValidator {
  async validate(
    known: KnownRoot,
    rel: string | undefined,
    reply: FastifyReply,
    { mustExist }: { mustExist: boolean },
  ): Promise<CheckedRelPath | null> {
    const lexical = this.lexicallyValidate(known, rel, reply);
    if (lexical === null) return null;
    if (!mustExist) return lexical;
    return this.realpathValidate(known, lexical, reply);
  }

  private lexicallyValidate(
    known: KnownRoot,
    rel: string | undefined,
    reply: FastifyReply,
  ): CheckedRelPath | null {
    if (typeof rel !== "string" || rel.length === 0) {
      reply.code(400).send({ code: "REL_PATH_REQUIRED", message: "rel_path is required" });
      return null;
    }
    if (isAbsolute(rel)) {
      reply.code(400).send({
        code: "REL_PATH_NOT_RELATIVE",
        message: "rel_path must be relative to the project root",
      });
      return null;
    }
    const target = join(known.root, rel);
    const lexRel = relative(known.root, target);
    if (this.escapesRoot(lexRel)) {
      reply.code(403).send({
        code: "PATH_OUTSIDE_PROJECT",
        message: "rel_path escapes the project root",
      });
      return null;
    }
    return { abs: target, rel: this.toPosixRel(lexRel) };
  }

  private async realpathValidate(
    known: KnownRoot,
    lexical: CheckedRelPath,
    reply: FastifyReply,
  ): Promise<CheckedRelPath | null> {
    let canonical: string;
    try {
      canonical = await realpath(lexical.abs);
    } catch {
      reply.code(404).send({
        code: "PATH_NOT_FOUND",
        message: `path not found: ${lexical.rel}`,
      });
      return null;
    }
    const guard = projectRootGuard(known.root, canonical);
    if (!guard.ok) {
      reply.code(guard.status).send(guard.body);
      return null;
    }
    return { abs: canonical, rel: lexical.rel };
  }

  private escapesRoot(rel: string): boolean {
    return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  }

  private toPosixRel(rel: string): string {
    return rel.split(sep).join("/");
  }
}

export class GitRouteContext {
  readonly deps: PathDeps;

  constructor(
    depsArg: Paths | PathDeps,
    private readonly git: GitService,
    private readonly relValidator = new GitPathValidator(),
  ) {
    this.deps = normaliseDeps(depsArg);
  }

  async resolveScope(
    query: RootScopeQuery,
    reply: FastifyReply,
  ): Promise<KnownRoot | null> {
    const scope = await resolveKnownRootScope(this.deps, {
      path_id: query.path_id,
      root: query.root,
    });
    if (!scope.ok) {
      reply.code(scope.status).send(scope.body);
      return null;
    }
    return scope.known;
  }

  rejectUnsafeBase(base: string | undefined, reply: FastifyReply): boolean {
    if (typeof base !== "string" || base.length === 0 || isSafeRef(base)) {
      return false;
    }
    reply.code(400).send({
      code: "INVALID_BASE_REF",
      message: `unsafe base ref: ${base}`,
    });
    return true;
  }

  async resolveBase(
    known: KnownRoot,
    preview: string | null,
  ): Promise<GitResolvedBase> {
    return resolveBase(this.git, known.root, {
      override: await savedOverride(known.paths),
      preview,
    });
  }

  resolveRel(
    known: KnownRoot,
    rel: string | undefined,
    reply: FastifyReply,
    options: { mustExist: boolean },
  ): Promise<CheckedRelPath | null> {
    return this.relValidator.validate(known, rel, reply, options);
  }
}
