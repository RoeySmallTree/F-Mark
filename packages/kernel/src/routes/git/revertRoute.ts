import type { FastifyReply } from "fastify";
import {
  actionsForStatus,
  type GitChangedFile,
  type GitHunk,
  type GitRevertAction,
  type GitRevertHunkResponse,
} from "@f-mark/shared";
import type { GitResolvedBase } from "../../git/service.js";
import {
  HunkConflictError,
  RevertConflictError,
  RevertFailedError,
  RevertNotAllowedError,
  type GitMutator,
  type RevertContext,
} from "../../git/revert.js";
import type { KnownRoot } from "../rootScope.js";
import { GitRouteContext, modeFromQuery } from "./context.js";
import { GitChangeSetService, GitHunkComputer, GitSessionGate } from "./hunks.js";

export interface RevertHunkBody {
  path_id?: string;
  root?: string;
  session_id?: string;
  rel_path?: string;
  mode?: string;
  base?: string;
  hunk_id?: string;
  action?: string;
  old_path?: string;
}

interface RouteFailure {
  status: number;
  body: {
    code: string;
    message: string;
    details?: string;
  };
}

interface RevertPlan {
  root: string;
  entry: GitChangedFile;
  mergeBaseSha: string;
  action: GitRevertAction;
  hunk: GitHunk | undefined;
}

function isFailure(value: unknown): value is RouteFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "body" in value
  );
}

export class GitRevertHunkRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly mutator: GitMutator,
    private readonly changes: GitChangeSetService,
    private readonly hunks: GitHunkComputer,
    private readonly gate = new GitSessionGate(),
  ) {}

  async handle(
    body: RevertHunkBody | undefined,
    reply: FastifyReply,
  ): Promise<GitRevertHunkResponse | FastifyReply> {
    const requestBody = body ?? {};
    const plan = await this.prepare(requestBody, reply);
    if (plan === null) return reply;
    if (isFailure(plan)) return this.send(reply, plan);
    return this.performRevert(
      reply,
      plan.root,
      plan.entry,
      plan.mergeBaseSha,
      plan.action,
      plan.hunk,
    );
  }

  private async prepare(
    requestBody: RevertHunkBody,
    reply: FastifyReply,
  ): Promise<RevertPlan | RouteFailure | null> {
    const scoped = await this.resolveScopedRequest(requestBody, reply);
    if (scoped === null) return null;
    const base = await this.context.resolveBase(scoped.known, requestBody.base ?? null);
    const ready = this.readyBase(base);
    if (isFailure(ready)) return ready;
    return this.planForEntry(scoped, requestBody, ready.mergeBaseSha);
  }

  private async planForEntry(
    scoped: { known: KnownRoot; relPosix: string },
    requestBody: RevertHunkBody,
    mergeBaseSha: string,
  ): Promise<RevertPlan | RouteFailure> {
    const entry = await this.changedEntry(scoped.known, mergeBaseSha, scoped.relPosix);
    if (isFailure(entry)) return entry;
    const gateFailure = await this.sessionFailure(scoped.known, requestBody, entry);
    if (gateFailure !== null) return gateFailure;
    const action = this.actionFrom(requestBody.action);
    const actionFailure = this.actionFailure(entry, action);
    if (actionFailure !== null) return actionFailure;
    const hunk = await this.hunkForAction(
      scoped.known,
      mergeBaseSha,
      entry,
      action,
      requestBody.hunk_id,
    );
    if (isFailure(hunk)) return hunk;
    return { root: scoped.known.root, entry, mergeBaseSha, action, hunk };
  }

  private async resolveScopedRequest(
    body: RevertHunkBody,
    reply: FastifyReply,
  ): Promise<{ known: KnownRoot; relPosix: string } | null> {
    const known = await this.context.resolveScope(
      { path_id: body.path_id, root: body.root },
      reply,
    );
    if (known === null) return null;
    if (this.context.rejectUnsafeBase(body.base, reply)) return null;
    const checked = await this.context.resolveRel(known, body.rel_path, reply, {
      mustExist: false,
    });
    if (checked === null) return null;
    return { known, relPosix: checked.rel };
  }

  private readyBase(base: GitResolvedBase): { mergeBaseSha: string } | RouteFailure {
    if (base.status === "ok" && base.mergeBaseSha !== null) {
      return { mergeBaseSha: base.mergeBaseSha };
    }
    return {
      status: 409,
      body: {
        code: "BASE_NOT_AVAILABLE",
        message: `no base to revert against (${base.status})`,
      },
    };
  }

  private async changedEntry(
    known: KnownRoot,
    mergeBaseSha: string,
    relPosix: string,
  ): Promise<GitChangedFile | RouteFailure> {
    const entry = await this.changes.find(known.root, mergeBaseSha, relPosix);
    if (entry !== undefined) return entry;
    return {
      status: 409,
      body: {
        code: "HUNK_CONFLICT",
        message: "file has no changes against the base — refresh the diff",
      },
    };
  }

  private async sessionFailure(
    known: KnownRoot,
    body: RevertHunkBody,
    entry: GitChangedFile,
  ): Promise<RouteFailure | null> {
    const allowed = await this.gate.isAllowed(
      known,
      modeFromQuery(body.mode),
      body.session_id,
      entry.rel_path,
      entry.old_path,
    );
    if (allowed) return null;
    return {
      status: 409,
      body: {
        code: "HUNK_CONFLICT",
        message: "file is not part of the current session diff",
      },
    };
  }

  private actionFrom(raw: string | undefined): GitRevertAction {
    return raw === "file" || raw === "rename" ? raw : "hunk";
  }

  private actionFailure(
    entry: GitChangedFile,
    action: GitRevertAction,
  ): RouteFailure | null {
    const available = actionsForStatus(entry.status);
    const allowed =
      (action === "hunk" && available.hunk) ||
      (action === "file" && available.file) ||
      (action === "rename" && available.rename);
    if (allowed) return null;
    return {
      status: 400,
      body: {
        code: "REVERT_NOT_ALLOWED",
        message: `action ${action} is not valid for status ${entry.status}`,
      },
    };
  }

  private async hunkForAction(
    known: KnownRoot,
    mergeBaseSha: string,
    entry: GitChangedFile,
    action: GitRevertAction,
    hunkId: string | undefined,
  ): Promise<GitHunk | undefined | RouteFailure> {
    if (action !== "hunk") return undefined;
    const hunks = await this.hunks.compute(known.root, mergeBaseSha, entry);
    if (hunks === null) {
      return {
        status: 400,
        body: {
          code: "REVERT_NOT_ALLOWED",
          message: "binary files only support a file-level revert",
        },
      };
    }
    const hunk = hunks.find((candidate) => candidate.id === hunkId);
    if (hunk !== undefined) return hunk;
    return {
      status: 409,
      body: {
        code: "HUNK_CONFLICT",
        message: `hunk ${hunkId ?? "?"} not found in the current diff — refresh`,
      },
    };
  }

  private async performRevert(
    reply: FastifyReply,
    root: string,
    entry: GitChangedFile,
    mergeBaseSha: string,
    action: GitRevertAction,
    hunk: GitHunk | undefined,
  ): Promise<GitRevertHunkResponse | FastifyReply> {
    try {
      const performed = await this.mutator.revert(
        this.revertContext(root, entry, mergeBaseSha, hunk),
        action,
      );
      return {
        status: "ok",
        action: performed,
        rel_path: entry.rel_path,
        file_status: entry.status,
      };
    } catch (err) {
      return this.send(reply, this.errorFailure(err));
    }
  }

  private revertContext(
    root: string,
    entry: GitChangedFile,
    mergeBaseSha: string,
    hunk: GitHunk | undefined,
  ): RevertContext {
    return {
      root,
      relPosix: entry.rel_path,
      ...(entry.old_path !== undefined ? { oldPath: entry.old_path } : {}),
      status: entry.status,
      mergeBaseSha,
      ...(hunk !== undefined ? { hunk } : {}),
    };
  }

  private errorFailure(err: unknown): RouteFailure {
    if (err instanceof HunkConflictError) {
      return {
        status: 409,
        body: {
          code: "HUNK_CONFLICT",
          message: "hunk no longer applies — refresh the diff",
          details: err.detail,
        },
      };
    }
    if (err instanceof RevertConflictError) {
      return {
        status: 409,
        body: {
          code: "REVERT_CONFLICT",
          message: "file no longer matches the diff — refresh",
          details: err.message,
        },
      };
    }
    if (err instanceof RevertNotAllowedError) {
      return {
        status: 400,
        body: { code: "REVERT_NOT_ALLOWED", message: err.message },
      };
    }
    if (err instanceof RevertFailedError) {
      return {
        status: 500,
        body: { code: "REVERT_FAILED", message: err.message },
      };
    }
    return {
      status: 500,
      body: { code: "REVERT_FAILED", message: (err as Error).message },
    };
  }

  private send(reply: FastifyReply, failure: RouteFailure): FastifyReply {
    return reply.code(failure.status).send(failure.body);
  }
}
