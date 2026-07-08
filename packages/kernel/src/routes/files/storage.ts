import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type Stats } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyReply } from "fastify";
import type { FileRefPayload } from "@f-mark/shared";
import type { Paths } from "../../paths.js";
import { readEvents } from "../../events/reader.js";
import { isActiveContentMime } from "../../lib/mimeTable.js";
import { displayNameFor, safePathName } from "./metadata.js";

export interface AttachmentUpload {
  id: string;
  path: string;
  mimeType: string;
  displayName: string;
  sizeBytes: number;
  uploadDir: string;
}

export interface AttachmentFilePart {
  filename?: string;
  mimetype: string;
  file: NodeJS.ReadableStream;
}

function attachmentId(): string {
  return `att_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function saveAttachmentFile(
  p: Paths,
  sessionId: string,
  filePart: AttachmentFilePart,
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
    await removeUploadDir(uploadDir).catch(() => {});
    throw err;
  }
  return { id, path: relativePath, mimeType, displayName, sizeBytes, uploadDir };
}

export async function removeUpload(upload: AttachmentUpload): Promise<void> {
  await removeUploadDir(upload.uploadDir);
}

export async function removeUploadDir(uploadDir: string): Promise<void> {
  await rm(uploadDir, { recursive: true, force: true });
}

export function resolveAttachmentPath(
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

export async function findAttachment(
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

export async function serveAttachmentContent(
  reply: FastifyReply,
  filepath: string,
  mimeType: string,
): Promise<FastifyReply> {
  const stats = await attachmentFileStats(reply, filepath);
  if (stats === null) return reply;

  reply.type(mimeType);
  reply.header("X-Content-Type-Options", "nosniff");
  if (isActiveContentMime(mimeType)) {
    reply.header("Content-Security-Policy", "sandbox");
  }
  reply.header("content-length", String(stats.size));
  return reply.send(createReadStream(filepath));
}

async function attachmentFileStats(
  reply: FastifyReply,
  filepath: string,
): Promise<Stats | null> {
  let stats;
  try {
    stats = await stat(filepath);
  } catch {
    reply.code(404);
    reply.send({ error: "not found" });
    return null;
  }
  if (!stats.isFile()) {
    reply.code(404);
    reply.send({ error: "not found" });
    return null;
  }
  return stats;
}
