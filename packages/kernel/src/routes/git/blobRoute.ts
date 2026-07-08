import type { FastifyReply } from "fastify";
import { mimeForExtension } from "../../lib/mimeTable.js";
import type { GitService } from "../../git/service.js";
import { resolveWorkingFileUnderRoot } from "../../git/workingFile.js";
import type { KnownRoot } from "../rootScope.js";
import { GitBlobResponseWriter } from "./content.js";
import { GitChangeSetService } from "./hunks.js";
import { GitRouteContext, type RelPathQuery } from "./context.js";

export interface BlobVersionQuery extends RelPathQuery {
  version?: string;
}

export class GitBlobVersionRoute {
  constructor(
    private readonly context: GitRouteContext,
    private readonly git: GitService,
    private readonly changes: GitChangeSetService,
  ) {}

  async handle(
    query: BlobVersionQuery,
    rangeHeader: string | undefined,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const request = await this.resolveRequest(query, reply);
    if (request === null) return reply;
    const writer = new GitBlobResponseWriter(reply, mimeForExtension(request.relPosix));
    if (request.version === "working") {
      return this.streamWorking(request.known.root, request.relPosix, rangeHeader, writer);
    }
    return this.streamBase(request.known, request.relPosix, query.base ?? null, rangeHeader, writer);
  }

  private async resolveRequest(
    query: BlobVersionQuery,
    reply: FastifyReply,
  ): Promise<{ known: KnownRoot; relPosix: string; version: "base" | "working" } | null> {
    const known = await this.context.resolveScope(query, reply);
    if (known === null) return null;
    if (this.context.rejectUnsafeBase(query.base, reply)) return null;
    const checked = await this.context.resolveRel(known, query.rel_path, reply, {
      mustExist: false,
    });
    if (checked === null) return null;
    return {
      known,
      relPosix: checked.rel,
      version: query.version === "base" ? "base" : "working",
    };
  }

  private async streamWorking(
    root: string,
    relPosix: string,
    rangeHeader: string | undefined,
    writer: GitBlobResponseWriter,
  ): Promise<FastifyReply> {
    const resolved = await resolveWorkingFileUnderRoot(root, relPosix);
    if (resolved.kind === "escaped") {
      return writer.jsonError(
        403,
        "PATH_OUTSIDE_PROJECT",
        "path must live inside the scoped project root",
      );
    }
    if (resolved.kind === "missing") {
      return writer.jsonError(404, "PATH_NOT_FOUND", `path not found: ${relPosix}`);
    }
    if (resolved.kind === "not-file") {
      return writer.jsonError(400, "PATH_NOT_FILE", "path is not a file");
    }
    return writer.sendLocalFile(rangeHeader, resolved);
  }

  private async streamBase(
    known: KnownRoot,
    relPosix: string,
    preview: string | null,
    rangeHeader: string | undefined,
    writer: GitBlobResponseWriter,
  ): Promise<FastifyReply> {
    const base = await this.context.resolveBase(known, preview);
    if (base.status !== "ok" || base.mergeBaseSha === null) {
      return writer.jsonError(404, "BASE_NOT_AVAILABLE", `no base version (${base.status})`);
    }
    const entry = await this.changes.find(known.root, base.mergeBaseSha, relPosix);
    const baseLookupPath = entry?.old_path ?? relPosix;
    const info = await this.git.blobInfo(known.root, base.mergeBaseSha, baseLookupPath);
    if (info === null) {
      return writer.jsonError(404, "BASE_BLOB_NOT_FOUND", "file does not exist at base");
    }
    return writer.sendGitBlob(rangeHeader, this.git, known.root, info.objectId, info.size);
  }
}
