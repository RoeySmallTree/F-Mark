import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  FilePreviewKind,
  FileRefPayload,
  PostFileBody,
  UploadAttachmentResponse,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import { writeFileRefEvent } from "../services/events.js";
import { publishEventWrites } from "../services/eventPublisher.js";

/** Local-first upload cap for fastify-multipart (consumed by server.ts at
 *  register time). The files live on the user's machine, so keep this high
 *  enough for large media without accepting accidental multi-GB drops. */
export const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024;

interface AttachmentUpload {
  id: string;
  path: string;
  mimeType: string;
  displayName: string;
  sizeBytes: number;
  uploadDir: string;
}

async function ensureSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function extForMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "text/csv") return ".csv";
  if (mime.startsWith("text/")) return ".txt";
  return ".bin";
}

function displayNameFor(filename: string | undefined, mimeType: string): string {
  const basename = filename?.split(/[\\/]/).pop()?.trim();
  if (basename !== undefined && basename.length > 0) return basename;
  const stem = mimeType.toLowerCase().startsWith("image/")
    ? "pasted-image"
    : "pasted-file";
  return `${stem}${extForMime(mimeType)}`;
}

function safePathName(displayName: string, mimeType: string): string {
  const basename = displayNameFor(displayName, mimeType)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (basename.length === 0 || basename === "." || basename === "..") {
    return displayNameFor(undefined, mimeType);
  }
  return basename.slice(0, 180);
}

function previewKindFor(mimeType: string, displayName: string): FilePreviewKind {
  const mime = mimeType.toLowerCase();
  const name = displayName.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime === "text/csv" || name.endsWith(".csv")) return "csv";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "pptx";
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    /\.(md|markdown|txt|log|json|xml|ya?ml)$/.test(name)
  ) {
    return "text";
  }
  return "file";
}

function attachmentId(): string {
  return `att_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function saveAttachmentFile(
  p: Paths,
  sessionId: string,
  filePart: {
    filename?: string;
    mimetype: string;
    file: NodeJS.ReadableStream;
  },
): Promise<AttachmentUpload> {
  const mimeType = filePart.mimetype || "application/octet-stream";
  const id = attachmentId();
  const displayName = displayNameFor(filePart.filename, mimeType);
  const safeName = safePathName(displayName, mimeType);
  const relativePath = `attachments/${id}/${safeName}`;
  const uploadDir = join(p.sessionDir(sessionId), "attachments", id);
  await mkdir(uploadDir, { recursive: true });
  let sizeBytes = 0;
  const countBytes = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      sizeBytes += chunk.length;
      cb(null, chunk);
    },
  });
  try {
    await pipeline(
      filePart.file,
      countBytes,
      createWriteStream(join(p.sessionDir(sessionId), relativePath), {
        flags: "wx",
      }),
    );
  } catch (err) {
    await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  return { id, path: relativePath, mimeType, displayName, sizeBytes, uploadDir };
}

function resolveAttachmentPath(
  p: Paths,
  sessionId: string,
  payload: FileRefPayload,
): string | null {
  if (
    payload.schema !== "fmark.file.v1" &&
    !payload.path.startsWith("attachments/")
  ) {
    return null;
  }
  if (!payload.path.startsWith(`attachments/${payload.id}/`)) return null;
  if (payload.path.includes("..") || payload.path.includes("\0")) return null;
  const sessionRoot = resolve(p.sessionDir(sessionId));
  const target = resolve(join(sessionRoot, payload.path));
  if (target !== sessionRoot && !target.startsWith(`${sessionRoot}${sep}`)) {
    return null;
  }
  return target;
}

async function findAttachment(
  p: Paths,
  sessionId: string,
  fileId: string,
): Promise<FileRefPayload | null> {
  const events = await readEvents(p, sessionId, { kinds: ["file"] });
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    const payload = event.payload as Partial<FileRefPayload>;
    if (payload.id !== fileId || typeof payload.path !== "string") continue;
    if (typeof payload.mime_type !== "string") continue;
    return payload as FileRefPayload;
  }
  return null;
}

async function serveAttachmentContent(
  reply: FastifyReply,
  filepath: string,
  mimeType: string,
): Promise<FastifyReply> {
  let stats;
  try {
    stats = await stat(filepath);
  } catch {
    reply.code(404);
    return reply.send({ error: "not found" });
  }
  if (!stats.isFile()) {
    reply.code(404);
    return reply.send({ error: "not found" });
  }
  reply.type(mimeType);
  reply.header("content-length", String(stats.size));
  return reply.send(createReadStream(filepath));
}

export function registerFileRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.post<{ Params: { id: string }; Body: PostFileBody }>(
    "/sessions/:id/events/file",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "path", "mime_type"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            path: { type: "string", minLength: 1 },
            mime_type: { type: "string", minLength: 1 },
            display_name: { type: "string", minLength: 1 },
            size_bytes: { type: "integer", minimum: 0 },
            preview_kind: {
              type: "string",
              enum: [
                "image",
                "text",
                "pdf",
                "csv",
                "docx",
                "xlsx",
                "pptx",
                "file",
              ],
            },
            description: { type: "string" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeFileRefEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  /* Upload-only: stages a file on disk under <session>/attachments/<id>/
     and returns its metadata. The caller (compose) commits the
     attachment by POSTing /sessions/:id/events/file with this metadata
     (plus optional append_to) when the user hits Send. */
  app.post<{ Params: { id: string } }>(
    "/sessions/:id/attachments",
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      if (!req.isMultipart()) {
        reply.code(400);
        return { error: "expected multipart/form-data" };
      }

      const fields: Record<string, string> = {};
      let upload: AttachmentUpload | null = null;

      try {
        for await (const part of req.parts()) {
          if (part.type === "field") {
            const value = stringField(part.value);
            if (value !== undefined) fields[part.fieldname] = value;
            continue;
          }
          if (part.fieldname !== "file") {
            part.file.resume();
            continue;
          }
          if (upload !== null) {
            part.file.resume();
            throw new Error("only one file may be uploaded at a time");
          }
          upload = await saveAttachmentFile(p, req.params.id, part);
        }

        if (upload === null) throw new Error("file is required");

        const displayName = fields.display_name?.trim() || upload.displayName;
        const response: UploadAttachmentResponse = {
          id: upload.id,
          display_name: displayName,
          path: upload.path,
          mime_type: upload.mimeType,
          size_bytes: upload.sizeBytes,
          preview_kind: previewKindFor(upload.mimeType, displayName),
        };
        return response;
      } catch (err) {
        if (upload !== null) {
          await rm(upload.uploadDir, { recursive: true, force: true }).catch(
            () => {},
          );
        }
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  /* Remove a staged attachment that has not yet been committed via a
     file event. Refuses (409) if any file event in this session already
     references the file_id — those events would break if we deleted the
     bytes from disk. */
  app.delete<{ Params: { id: string; file_id: string } }>(
    "/sessions/:id/attachments/:file_id",
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      const fileId = req.params.file_id;
      if (!/^att_[a-f0-9]{12}$/.test(fileId)) {
        reply.code(400);
        return { error: "invalid attachment id" };
      }
      const referenced = await findAttachment(p, req.params.id, fileId);
      if (referenced !== null) {
        reply.code(409);
        return { error: "attachment is already committed to a file event" };
      }
      const dir = join(p.sessionDir(req.params.id), "attachments", fileId);
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (err) {
        reply.code(500);
        return { error: err instanceof Error ? err.message : String(err) };
      }
      reply.code(204);
      return reply.send();
    },
  );

  app.get<{ Params: { id: string; file_id: string } }>(
    "/sessions/:id/attachments/:file_id/content",
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return reply;
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
    },
  );
}
