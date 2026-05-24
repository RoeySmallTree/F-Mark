import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { EventKind, FilePreviewKind, FileRefPayload } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import { writeEventFile } from "../events/writer.js";
import { validateNonProseAppendTo } from "../events/proseValidate.js";
import type { Bus, BusMessage } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

/** Upload size cap for the fastify-multipart plugin (consumed by
 *  server.ts at register time). 64 MiB is a conservative default; the
 *  user's WIP attachment feature can override per-route. Defined here
 *  so server.ts's import resolves cleanly. */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;

interface FileBody {
  participant_id: string;
  id: string;
  path: string;
  mime_type: string;
  description?: string;
  append_to?: string;
}

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

  function publish(
    sessionId: string,
    filename: string,
    kind: EventKind,
    participantId: string,
  ): void {
    const bus = getBus();
    const added: BusMessage = {
      type: "event_added",
      session_id: sessionId,
      filename,
      kind,
      participant_id: participantId,
    };
    bus.publish(added);
  }

  app.post<{ Params: { id: string }; Body: FileBody }>(
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
        const apCheck = validateNonProseAppendTo(req.body.append_to);
        if (!apCheck.ok) {
          reply.code(400);
          return { error: apCheck.error };
        }
        const { participant_id, ...rest } = req.body;
        const payload: FileRefPayload = {
          id: rest.id,
          path: rest.path,
          mime_type: rest.mime_type,
        };
        if (rest.description !== undefined) payload.description = rest.description;
        if (rest.append_to !== undefined) payload.append_to = rest.append_to;
        const filename = await writeEventFile(p, req.params.id, {
          participant_id,
          kind: "file",
          ext: "json",
          contents: JSON.stringify(payload, null, 2),
        });
        publish(req.params.id, filename, "file", participant_id);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id,
          kind: "file" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

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

        const participantId = fields.participant_id?.trim();
        if (participantId === undefined || participantId.length === 0) {
          throw new Error("participant_id is required");
        }
        if (upload === null) throw new Error("file is required");

        const displayName = fields.display_name?.trim() || upload.displayName;
        const payload: FileRefPayload = {
          schema: "fmark.file.v1",
          id: upload.id,
          display_name: displayName,
          path: upload.path,
          mime_type: upload.mimeType,
          size_bytes: upload.sizeBytes,
          preview_kind: previewKindFor(upload.mimeType, displayName),
        };
        const description = fields.description?.trim();
        if (description !== undefined && description.length > 0) {
          payload.description = description;
        }

        const filename = await writeEventFile(p, req.params.id, {
          participant_id: participantId,
          kind: "file",
          ext: "json",
          contents: JSON.stringify(payload, null, 2),
        });
        publish(req.params.id, filename, "file", participantId);
        return {
          filename,
          timestamp: filename.split("_")[0]!,
          participant_id: participantId,
          kind: "file" as const,
          payload,
        };
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
