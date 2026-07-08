import type { FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import type { GitChangedFile } from "@f-mark/shared";
import { looksBinary, type GitService } from "../../git/service.js";
import {
  resolveWorkingFileUnderRoot,
  type WorkingFile,
} from "../../git/workingFile.js";
import { isActiveContentMime } from "../../lib/mimeTable.js";

const MAX_VERSION_BYTES = 16 * 1024 * 1024;
const MAX_FULL_BLOB_BYTES = 100 * 1024 * 1024;

interface ByteRange {
  start: number;
  end: number;
}

class ByteRangeParser {
  parse(raw: string | undefined, size: number): ByteRange | null | "invalid" {
    if (raw === undefined || raw === null) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
    if (match === null) return "invalid";
    return this.fromParts(match[1] ?? "", match[2] ?? "", size);
  }

  private fromParts(
    startStr: string,
    endStr: string,
    size: number,
  ): ByteRange | "invalid" {
    const range =
      startStr.length === 0
        ? this.suffixRange(endStr, size)
        : this.explicitRange(startStr, endStr, size);
    if (range === "invalid") return "invalid";
    return this.satisfiable(range, size) ? range : "invalid";
  }

  private suffixRange(endStr: string, size: number): ByteRange | "invalid" {
    if (endStr.length === 0) return "invalid";
    const suffix = Number.parseInt(endStr, 10);
    if (Number.isNaN(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  private explicitRange(
    startStr: string,
    endStr: string,
    size: number,
  ): ByteRange | "invalid" {
    const start = Number.parseInt(startStr, 10);
    if (Number.isNaN(start) || start < 0) return "invalid";
    const end = this.explicitEnd(endStr, size);
    if (end === "invalid") return "invalid";
    return { start, end };
  }

  private explicitEnd(endStr: string, size: number): number | "invalid" {
    if (endStr.length === 0) return size - 1;
    const end = Number.parseInt(endStr, 10);
    if (Number.isNaN(end)) return "invalid";
    return Math.min(end, size - 1);
  }

  private satisfiable(range: ByteRange, size: number): boolean {
    return range.start <= range.end && range.start < size;
  }
}

export interface TextReadResult {
  text: string;
  binary: boolean;
  truncated: boolean;
  missing: boolean;
}

export class GitTextFileReader {
  async readTextHeadGuarded(
    root: string,
    relPosix: string,
  ): Promise<string | "binary" | null> {
    const resolved = await resolveWorkingFileUnderRoot(root, relPosix);
    const result = await this.readResolvedWorkingFile(resolved);
    if (result.binary) return "binary";
    if (result.missing) return null;
    return result.text;
  }

  async readBaseText(
    git: GitService,
    root: string,
    mergeBaseSha: string,
    entry: GitChangedFile,
    relPosix: string,
  ): Promise<TextReadResult> {
    if (entry.status === "added" || entry.status === "untracked") {
      return this.empty();
    }
    const baseLookupPath = entry.old_path ?? relPosix;
    const blob = await git.showBlob(root, mergeBaseSha, baseLookupPath);
    if (blob === null) return this.empty({ missing: true });
    if (looksBinary(blob.buf)) return this.binary();
    const text = this.truncateText(blob.buf, MAX_VERSION_BYTES);
    return {
      text: text.text,
      binary: false,
      truncated: text.truncated || blob.truncated,
      missing: false,
    };
  }

  async readWorkingText(
    root: string,
    entry: GitChangedFile,
  ): Promise<TextReadResult> {
    if (entry.status === "deleted" || entry.status === "binary-deleted") {
      return this.empty();
    }
    const resolved = await resolveWorkingFileUnderRoot(root, entry.rel_path);
    return this.readResolvedWorkingFile(resolved);
  }

  private async readResolvedWorkingFile(file: WorkingFile): Promise<TextReadResult> {
    if (file.kind === "escaped" || file.kind === "not-file") return this.binary();
    if (file.kind === "missing") return this.empty({ missing: true });
    const head = await this.readBytesCapped(file.abs, MAX_VERSION_BYTES);
    if (head === null) return this.empty({ missing: true });
    if (looksBinary(head.buf)) return this.binary();
    return {
      text: head.buf.toString("utf8"),
      binary: false,
      truncated: head.truncated,
      missing: false,
    };
  }

  private truncateText(
    buf: Buffer,
    max: number,
  ): { text: string; truncated: boolean } {
    if (buf.length <= max) return { text: buf.toString("utf8"), truncated: false };
    return { text: buf.subarray(0, max).toString("utf8"), truncated: true };
  }

  private async readBytesCapped(
    abs: string,
    max: number,
  ): Promise<{ buf: Buffer; truncated: boolean } | null> {
    try {
      const fh = await open(abs, "r");
      try {
        const info = await fh.stat();
        const size = Math.min(info.size, max);
        const buf = Buffer.alloc(size);
        if (size > 0) await fh.read(buf, 0, size, 0);
        return { buf, truncated: info.size > max };
      } finally {
        await fh.close();
      }
    } catch {
      return null;
    }
  }

  private binary(): TextReadResult {
    return { text: "", binary: true, truncated: false, missing: false };
  }

  private empty(options: { missing?: boolean } = {}): TextReadResult {
    return {
      text: "",
      binary: false,
      truncated: false,
      missing: options.missing ?? false,
    };
  }
}

interface BlobStreamSource {
  full(): NodeJS.ReadableStream;
  range(start: number, end: number): NodeJS.ReadableStream;
}

export class GitBlobResponseWriter {
  constructor(
    private readonly reply: FastifyReply,
    private readonly mime: string,
    private readonly rangeParser = new ByteRangeParser(),
  ) {}

  jsonError(
    status: number,
    code: string,
    message: string,
    extraHeaders?: Record<string, string>,
  ): FastifyReply {
    this.reply.header("Content-Type", "application/json; charset=utf-8");
    for (const [key, value] of Object.entries(extraHeaders ?? {})) {
      this.reply.header(key, value);
    }
    return this.reply.code(status).send({ code, message });
  }

  sendLocalFile(
    rawRange: string | undefined,
    file: { abs: string; size: number },
  ): FastifyReply {
    return this.sendRangeAware(
      rawRange,
      file.size,
      {
        full: () => createReadStream(file.abs),
        range: (start, end) => createReadStream(file.abs, { start, end }),
      },
      `file is ${file.size} bytes; use a Range request`,
    );
  }

  sendGitBlob(
    rawRange: string | undefined,
    git: GitService,
    root: string,
    objectId: string,
    size: number,
  ): FastifyReply {
    return this.sendRangeAware(
      rawRange,
      size,
      {
        full: () =>
          size === 0
            ? Readable.from(Buffer.alloc(0))
            : git.showBlobRange(root, objectId, 0, size - 1),
        range: (start, end) => git.showBlobRange(root, objectId, start, end),
      },
      `base blob is ${size} bytes; use a Range request`,
    );
  }

  private sendRangeAware(
    rawRange: string | undefined,
    size: number,
    source: BlobStreamSource,
    tooLargeMessage: string,
  ): FastifyReply {
    const range = this.rangeParser.parse(rawRange, size);
    if (range === "invalid") return this.rangeNotSatisfiable(size);
    if (range === null) return this.sendFull(size, source, tooLargeMessage);
    return this.sendPartial(size, range, source);
  }

  private sendFull(
    size: number,
    source: BlobStreamSource,
    tooLargeMessage: string,
  ): FastifyReply {
    if (size > MAX_FULL_BLOB_BYTES) {
      return this.jsonError(413, "FILE_TOO_LARGE", tooLargeMessage);
    }
    this.applyContentHeaders();
    this.reply.header("Content-Length", String(size));
    return this.reply.send(source.full());
  }

  private sendPartial(
    size: number,
    range: ByteRange,
    source: BlobStreamSource,
  ): FastifyReply {
    const length = range.end - range.start + 1;
    this.applyContentHeaders();
    this.reply.code(206);
    this.reply.header("Content-Length", String(length));
    this.reply.header("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    return this.reply.send(source.range(range.start, range.end));
  }

  private rangeNotSatisfiable(size: number): FastifyReply {
    return this.jsonError(
      416,
      "RANGE_NOT_SATISFIABLE",
      "invalid or out-of-bounds Range header",
      { "Content-Range": `bytes */${size}` },
    );
  }

  private applyContentHeaders(): void {
    this.reply.header("Content-Type", this.mime);
    this.reply.header("Accept-Ranges", "bytes");
    this.reply.header("Cache-Control", "no-store");
    this.reply.header("X-Content-Type-Options", "nosniff");
    if (isActiveContentMime(this.mime)) {
      this.reply.header("Content-Security-Policy", "sandbox");
    }
  }
}
