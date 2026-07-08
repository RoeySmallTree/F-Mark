import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { UploadAttachmentResponse } from "@f-mark/shared";
import type { Paths } from "../../paths.js";
import type { PathDeps } from "../pathDeps.js";
import { ensureEventSession } from "../events/scopedWrite.js";
import { previewKindFor } from "./metadata.js";
import { resolveAttachmentPaths, type AttachmentScopeQuery } from "./scope.js";
import {
  findAttachment,
  removeUploadDir,
  removeUpload,
  resolveAttachmentPath,
  saveAttachmentFile,
  serveAttachmentContent,
  type AttachmentUpload,
} from "./storage.js";

/** Local-first upload cap for fastify-multipart (consumed by server.ts at
 *  register time). The files live on the user's machine, so keep this high
 *  enough for large media without accepting accidental multi-GB drops. */
export const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024;

type MultipartPart = ReturnType<FastifyRequest["parts"]> extends AsyncIterableIterator<infer Part>
  ? Part
  : never;

interface MultipartUploadState {
  fields: Record<string, string>;
  upload: AttachmentUpload | null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errorBody(err: unknown): { error: string } {
  return { error: err instanceof Error ? err.message : String(err) };
}

async function acceptMultipartPart(
  state: MultipartUploadState,
  p: Paths,
  sessionId: string,
  part: MultipartPart,
): Promise<void> {
  if (part.type === "field") {
    const value = stringField(part.value);
    if (value !== undefined) state.fields[part.fieldname] = value;
    return;
  }
  if (part.fieldname !== "file") {
    part.file.resume();
    return;
  }
  if (state.upload !== null) {
    part.file.resume();
    throw new Error("only one file may be uploaded at a time");
  }
  state.upload = await saveAttachmentFile(p, sessionId, part);
}

function requireUpload(state: MultipartUploadState): AttachmentUpload {
  if (state.upload === null) throw new Error("file is required");
  return state.upload;
}

async function collectMultipartAttachment(
  req: FastifyRequest,
  p: Paths,
  sessionId: string,
): Promise<MultipartUploadState & { upload: AttachmentUpload }> {
  const state: MultipartUploadState = { fields: {}, upload: null };
  try {
    for await (const part of req.parts()) {
      await acceptMultipartPart(state, p, sessionId, part);
    }
    return { ...state, upload: requireUpload(state) };
  } catch (err) {
    if (state.upload !== null) await removeUpload(state.upload).catch(() => {});
    throw err;
  }
}

function buildUploadResponse(
  upload: AttachmentUpload,
  fields: Record<string, string>,
): UploadAttachmentResponse {
  const displayName = fields.display_name?.trim() || upload.displayName;
  return {
    id: upload.id,
    display_name: displayName,
    path: upload.path,
    mime_type: upload.mimeType,
    size_bytes: upload.sizeBytes,
    preview_kind: previewKindFor(upload.mimeType, displayName),
  };
}

async function uploadAttachment(
  req: FastifyRequest,
  p: Paths,
  sessionId: string,
): Promise<UploadAttachmentResponse> {
  const staged = await collectMultipartAttachment(req, p, sessionId);
  return buildUploadResponse(staged.upload, staged.fields);
}

function isAttachmentId(fileId: string): boolean {
  return /^att_[a-f0-9]{12}$/.test(fileId);
}

export function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: PathDeps,
): void {
  /* Upload-only: stages a file on disk under <session>/attachments/<id>/
     and returns its metadata. The caller (compose) commits the
     attachment by POSTing /sessions/:id/events/file with this metadata
     (plus optional append_to) when the user hits Send. */
  app.post<{
    Params: { id: string };
    Querystring: AttachmentScopeQuery;
  }>("/sessions/:id/attachments", async (req, reply) => {
    const p = await resolveAttachmentPaths(deps, req.query, reply);
    if (p === null) return;
    if (!(await ensureEventSession(p, req.params.id, reply))) return;
    if (!req.isMultipart()) {
      reply.code(400);
      return { error: "expected multipart/form-data" };
    }
    try {
      return await uploadAttachment(req, p, req.params.id);
    } catch (err) {
      reply.code(400);
      return errorBody(err);
    }
  });

  /* Remove a staged attachment that has not yet been committed via a
     file event. Refuses (409) if any file event in this session already
     references the file_id — those events would break if we deleted the
     bytes from disk. */
  app.delete<{
    Params: { id: string; file_id: string };
    Querystring: AttachmentScopeQuery;
  }>("/sessions/:id/attachments/:file_id", async (req, reply) => {
    const p = await resolveAttachmentPaths(deps, req.query, reply);
    if (p === null) return;
    if (!(await ensureEventSession(p, req.params.id, reply))) return;
    const fileId = req.params.file_id;
    if (!isAttachmentId(fileId)) {
      reply.code(400);
      return { error: "invalid attachment id" };
    }
    const referenced = await findAttachment(p, req.params.id, fileId);
    if (referenced !== null) {
      reply.code(409);
      return { error: "attachment is already committed to a file event" };
    }
    try {
      await removeUploadDir(
        join(p.sessionDir(req.params.id), "attachments", fileId),
      );
    } catch (err) {
      reply.code(500);
      return errorBody(err);
    }
    reply.code(204);
    return reply.send();
  });

  app.get<{
    Params: { id: string; file_id: string };
    Querystring: AttachmentScopeQuery;
  }>("/sessions/:id/attachments/:file_id/content", async (req, reply) => {
    const p = await resolveAttachmentPaths(deps, req.query, reply);
    if (p === null) return reply;
    if (!(await ensureEventSession(p, req.params.id, reply))) return reply;
    const payload = await findAttachment(p, req.params.id, req.params.file_id);
    if (payload === null) {
      reply.code(404);
      return reply.send({ error: "attachment not found" });
    }
    const target = resolveAttachmentPath(p, req.params.id, payload);
    if (target === null) {
      reply.code(400);
      return reply.send({ error: "invalid attachment path" });
    }
    return serveAttachmentContent(reply, target, payload.mime_type);
  });
}
