import type { FastifyReply } from "fastify";
import type {
  GitBranchRefsResponse,
  GitDiffSettingsResponse,
} from "@f-mark/shared";
import type { GitService } from "../../git/service.js";
import { readConfig, writeConfig } from "../../project.js";
import type { KnownRoot } from "../rootScope.js";
import { GitRouteContext, savedOverride } from "./context.js";

export class GitBranchRefsRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly git: GitService,
  ) {}

  async get(
    query: { path_id?: string; root?: string },
    reply: FastifyReply,
  ): Promise<GitBranchRefsResponse | FastifyReply> {
    const known = await this.context.resolveScope(query, reply);
    if (known === null) return reply;
    if (!(await this.git.isGitWorktree(known.root))) {
      return {
        status: "not-git",
        path_id: known.path_id,
        root: known.root,
        current_ref: null,
        detected_base_ref: null,
        refs: [],
        error: null,
      };
    }
    const [current, detected, refs] = await Promise.all([
      this.git.currentRef(known.root),
      this.git.detectBaseRef(known.root),
      this.git.branchRefs(known.root),
    ]);
    return {
      status: "ok",
      path_id: known.path_id,
      root: known.root,
      current_ref: current,
      detected_base_ref: detected,
      refs,
      error: null,
    };
  }
}

export class GitDiffSettingsRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly git: GitService,
  ) {}

  async get(
    query: { path_id?: string; root?: string },
    reply: FastifyReply,
  ): Promise<GitDiffSettingsResponse | FastifyReply> {
    const known = await this.context.resolveScope(query, reply);
    if (known === null) return reply;
    return this.body(known);
  }

  async put(
    body: { path_id?: string; diff_base_ref_override?: string | null } | undefined,
    reply: FastifyReply,
  ): Promise<GitDiffSettingsResponse | FastifyReply> {
    const known = await this.context.resolveScope({ path_id: body?.path_id }, reply);
    if (known === null) return reply;
    const nextOverride = this.normalizedOverride(body?.diff_base_ref_override);
    const invalid = await this.validateOverride(known, nextOverride);
    if (invalid !== null) return reply.code(invalid.status).send(invalid.body);
    const writeFailed = await this.persistOverride(known, nextOverride);
    if (writeFailed !== null) return reply.code(500).send(writeFailed);
    return this.body(known);
  }

  private normalizedOverride(raw: string | null | undefined): string | null {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  }

  private async validateOverride(
    known: KnownRoot,
    nextOverride: string | null,
  ): Promise<{ status: number; body: { code: string; message: string } } | null> {
    if (nextOverride === null) return null;
    if (!(await this.git.isGitWorktree(known.root))) {
      return {
        status: 400,
        body: {
          code: "NOT_A_GIT_WORKTREE",
          message: "cannot set a base-ref override on a non-git root",
        },
      };
    }
    if (await this.git.validateRef(known.root, nextOverride)) return null;
    return {
      status: 400,
      body: {
        code: "INVALID_BASE_REF",
        message: `not a valid ref: ${nextOverride}`,
      },
    };
  }

  private async persistOverride(
    known: KnownRoot,
    nextOverride: string | null,
  ): Promise<{ code: string; message: string } | null> {
    try {
      const cfg = await readConfig(known.paths);
      cfg.git = { ...(cfg.git ?? {}), diff_base_ref_override: nextOverride };
      await writeConfig(known.paths, cfg);
      return null;
    } catch (err) {
      return { code: "CONFIG_WRITE_FAILED", message: (err as Error).message };
    }
  }

  private async body(known: KnownRoot): Promise<GitDiffSettingsResponse> {
    const override = await savedOverride(known.paths);
    const detected = (await this.git.isGitWorktree(known.root))
      ? await this.git.detectBaseRef(known.root)
      : null;
    const base = await this.context.resolveBase(known, null);
    return {
      path_id: known.path_id,
      root: known.root,
      diff_base_ref_override: override,
      detected_base_ref: detected,
      effective_base_ref: base.baseRef,
      merge_base_sha: base.mergeBaseSha,
      status: base.status,
      error: null,
    };
  }
}
