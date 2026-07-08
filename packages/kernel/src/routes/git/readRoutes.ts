import type { FastifyReply } from "fastify";
import {
  actionsForStatus,
  type GitChangedFile,
  type GitChangedFilesResponse,
  type GitDiffResponse,
  type GitFileStatus,
  type GitFileVersionResponse,
} from "@f-mark/shared";
import type { GitResolvedBase, GitService } from "../../git/service.js";
import type { KnownRoot } from "../rootScope.js";
import { GitTextFileReader } from "./content.js";
import { GitChangeSetService, GitHunkComputer } from "./hunks.js";
import { GitRouteContext, modeFromQuery, type BaseRefQuery, type RelPathQuery } from "./context.js";

export class GitChangedFilesRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly changes: GitChangeSetService,
  ) {}

  async handle(
    query: BaseRefQuery,
    reply: FastifyReply,
  ): Promise<GitChangedFilesResponse | FastifyReply> {
    const known = await this.context.resolveScope(query, reply);
    if (known === null) return reply;
    if (this.context.rejectUnsafeBase(query.base, reply)) return reply;
    const base = await this.context.resolveBase(known, query.base ?? null);
    if (base.status !== "ok" || base.mergeBaseSha === null) {
      return this.body(known, base, []);
    }
    const files = await this.changes.listForMode(
      known,
      base.mergeBaseSha,
      modeFromQuery(query.mode),
      query.session_id,
    );
    return this.body(known, base, files);
  }

  private body(
    known: KnownRoot,
    base: GitResolvedBase,
    files: GitChangedFile[],
  ): GitChangedFilesResponse {
    return {
      status: base.status,
      path_id: known.path_id,
      base_ref: base.baseRef,
      merge_base_sha: base.mergeBaseSha,
      files,
    };
  }
}

export class GitDiffRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly changes: GitChangeSetService,
    private readonly hunks: GitHunkComputer,
  ) {}

  async handle(
    query: RelPathQuery,
    reply: FastifyReply,
  ): Promise<GitDiffResponse | FastifyReply> {
    const request = await this.resolveRequest(query, reply);
    if (request === null) return reply;
    const base = await this.context.resolveBase(request.known, query.base ?? null);
    if (base.status !== "ok" || base.mergeBaseSha === null) {
      return this.noBaseBody(request.relPosix, base);
    }
    const lookup = await this.changes.findAllowed(
      request.known,
      base.mergeBaseSha,
      request.relPosix,
      modeFromQuery(query.mode),
      query.session_id,
    );
    if (lookup.entry === undefined || !lookup.allowed) {
      return this.noChangeBody(request.relPosix, base);
    }
    return this.entryBody(request.known.root, base, lookup.entry, request.relPosix);
  }

  private async resolveRequest(
    query: RelPathQuery,
    reply: FastifyReply,
  ): Promise<{ known: KnownRoot; relPosix: string } | null> {
    const known = await this.context.resolveScope(query, reply);
    if (known === null) return null;
    if (this.context.rejectUnsafeBase(query.base, reply)) return null;
    const checked = await this.context.resolveRel(known, query.rel_path, reply, {
      mustExist: false,
    });
    if (checked === null) return null;
    return { known, relPosix: checked.rel };
  }

  private async entryBody(
    root: string,
    base: GitResolvedBase,
    entry: GitChangedFile,
    relPosix: string,
  ): Promise<GitDiffResponse> {
    if (entry.binary) return this.binaryBody(entry, entry.status, base, relPosix);
    const hunks = await this.hunks.compute(root, base.mergeBaseSha!, entry);
    if (hunks === null) {
      const status = entry.status === "untracked" ? "binary-untracked" : entry.status;
      return this.binaryBody(entry, status, base, relPosix);
    }
    return {
      status: "ok",
      rel_path: relPosix,
      file_status: entry.status,
      ...(entry.old_path !== undefined ? { old_path: entry.old_path } : {}),
      binary: false,
      hunks,
      actions: actionsForStatus(entry.status),
      ...baseFields(base),
    };
  }

  private noBaseBody(relPosix: string, base: GitResolvedBase): GitDiffResponse {
    return {
      status: base.status,
      rel_path: relPosix,
      binary: false,
      hunks: [],
      ...baseFields(base),
    };
  }

  private noChangeBody(relPosix: string, base: GitResolvedBase): GitDiffResponse {
    return {
      status: "no-change",
      rel_path: relPosix,
      binary: false,
      hunks: [],
      ...baseFields(base),
    };
  }

  private binaryBody(
    entry: GitChangedFile,
    status: GitFileStatus,
    base: GitResolvedBase,
    relPosix: string,
  ): GitDiffResponse {
    return {
      status: "binary",
      rel_path: relPosix,
      file_status: status,
      ...(entry.old_path !== undefined ? { old_path: entry.old_path } : {}),
      binary: true,
      hunks: [],
      actions: actionsForStatus(status),
      ...baseFields(base),
    };
  }
}

export class GitFileVersionRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly git: GitService,
    private readonly changes: GitChangeSetService,
    private readonly textReader = new GitTextFileReader(),
  ) {}

  async handle(
    query: RelPathQuery,
    reply: FastifyReply,
  ): Promise<GitFileVersionResponse | FastifyReply> {
    const prepared = await this.prepare(query, reply);
    if (prepared === null) return reply;
    return this.responseFor(prepared);
  }

  private async prepare(
    query: RelPathQuery,
    reply: FastifyReply,
  ): Promise<FileVersionPrepared | null> {
    const request = await this.resolveRequest(query, reply);
    if (request === null) return null;
    const base = await this.context.resolveBase(request.known, query.base ?? null);
    if (base.status !== "ok" || base.mergeBaseSha === null) {
      return { kind: "empty", status: base.status, fileStatus: null, base };
    }
    const lookup = await this.changes.findAllowed(
      request.known,
      base.mergeBaseSha,
      request.relPosix,
      modeFromQuery(query.mode),
      query.session_id,
    );
    return this.entryPrepared(request, base, lookup);
  }

  private entryPrepared(
    request: { known: KnownRoot; relPosix: string },
    base: GitResolvedBase,
    lookup: { entry: GitChangedFile | undefined; allowed: boolean },
  ): FileVersionPrepared {
    if (lookup.entry === undefined || !lookup.allowed) {
      return { kind: "empty", status: "ok", fileStatus: lookup.entry?.status ?? null, base };
    }
    if (lookup.entry.binary) return { kind: "binary", status: lookup.entry.status, base };
    return {
      kind: "text",
      known: request.known,
      base,
      entry: lookup.entry,
      relPosix: request.relPosix,
    };
  }

  private responseFor(
    prepared: FileVersionPrepared,
  ): Promise<GitFileVersionResponse> | GitFileVersionResponse {
    if (prepared.kind === "empty") {
      return this.emptyBody(prepared.status, prepared.fileStatus, prepared.base);
    }
    if (prepared.kind === "binary") {
      return this.binaryBody(prepared.status, prepared.base);
    }
    return this.textBody(
      prepared.known,
      prepared.base,
      prepared.entry,
      prepared.relPosix,
    );
  }

  private async resolveRequest(
    query: RelPathQuery,
    reply: FastifyReply,
  ): Promise<{ known: KnownRoot; relPosix: string } | null> {
    const known = await this.context.resolveScope(query, reply);
    if (known === null) return null;
    if (this.context.rejectUnsafeBase(query.base, reply)) return null;
    const checked = await this.context.resolveRel(known, query.rel_path, reply, {
      mustExist: false,
    });
    if (checked === null) return null;
    return { known, relPosix: checked.rel };
  }

  private async textBody(
    known: KnownRoot,
    base: GitResolvedBase,
    entry: GitChangedFile,
    relPosix: string,
  ): Promise<GitFileVersionResponse> {
    const baseText = await this.textReader.readBaseText(
      this.git,
      known.root,
      base.mergeBaseSha!,
      entry,
      relPosix,
    );
    const workingText = await this.textReader.readWorkingText(known.root, entry);
    if (baseText.binary || workingText.binary) return this.binaryBody(entry.status, base);
    return {
      status: "ok",
      baseText: baseText.text,
      workingText: workingText.text,
      file_status: entry.status,
      truncated: baseText.truncated || workingText.truncated,
      binary: false,
      ...baseFields(base),
    };
  }

  private binaryBody(
    status: GitFileStatus | null,
    base: GitResolvedBase,
  ): GitFileVersionResponse {
    return {
      status: "binary",
      baseText: "",
      workingText: "",
      file_status: status,
      truncated: false,
      binary: true,
      ...baseFields(base),
    };
  }

  private emptyBody(
    status: GitFileVersionResponse["status"],
    fileStatus: GitFileStatus | null,
    base: GitResolvedBase,
  ): GitFileVersionResponse {
    return {
      status,
      baseText: "",
      workingText: "",
      file_status: fileStatus,
      truncated: false,
      binary: false,
      ...baseFields(base),
    };
  }
}

function baseFields(base: GitResolvedBase): {
  base_ref: string | null;
  merge_base_sha: string | null;
} {
  return {
    base_ref: base.baseRef,
    merge_base_sha: base.mergeBaseSha,
  };
}

type FileVersionPrepared =
  | {
      kind: "empty";
      status: GitFileVersionResponse["status"];
      fileStatus: GitFileStatus | null;
      base: GitResolvedBase;
    }
  | {
      kind: "binary";
      status: GitFileStatus | null;
      base: GitResolvedBase;
    }
  | {
      kind: "text";
      known: KnownRoot;
      base: GitResolvedBase;
      entry: GitChangedFile;
      relPosix: string;
    };
