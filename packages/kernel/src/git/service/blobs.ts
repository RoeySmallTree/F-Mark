import { Transform } from "node:stream";
import { spawnGitDetached } from "../gitRunner.js";
import type { GitCommandExecutor } from "./command.js";

const MAX_BLOB_BYTES = 16 * 1024 * 1024;
const BLOB_TIMEOUT_MS = 15_000;

export class GitBlobService {
  constructor(private readonly git: GitCommandExecutor) {}

  async showBlob(
    root: string,
    sha: string,
    relPath: string,
  ): Promise<{ buf: Buffer; truncated: boolean } | null> {
    return new Promise((resolve) => {
      const { child, kill } = spawnGitDetached(
        ["git", "-C", root, "show", "--end-of-options", `${sha}:${relPath}`],
        { timeoutMs: BLOB_TIMEOUT_MS, stderr: true },
      );
      const chunks: Buffer[] = [];
      let bytes = 0;
      let truncated = false;
      let timedOut = false;
      let settled = false;
      const settle = (
        v: { buf: Buffer; truncated: boolean } | null,
      ): void => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        resolve(v);
      };
      const killTimer = setTimeout(() => {
        timedOut = true;
        kill();
        settle(
          bytes === 0
            ? null
            : { buf: Buffer.concat(chunks), truncated: true },
        );
      }, BLOB_TIMEOUT_MS);
      if (typeof killTimer.unref === "function") killTimer.unref();
      child.stdout.on("data", (d: Buffer) => {
        if (bytes >= MAX_BLOB_BYTES) {
          truncated = true;
          kill();
          return;
        }
        const remaining = MAX_BLOB_BYTES - bytes;
        if (d.length > remaining) {
          chunks.push(d.subarray(0, remaining));
          bytes += remaining;
          truncated = true;
          kill();
        } else {
          chunks.push(d);
          bytes += d.length;
        }
      });
      child.stderr?.on("data", () => {});
      child.on("error", () => {
        settle(null);
      });
      child.on("close", (code) => {
        if (timedOut) return;
        if (code !== 0 && bytes === 0 && !truncated) {
          settle(null);
          return;
        }
        settle({ buf: Buffer.concat(chunks), truncated });
      });
    });
  }

  async blobInfo(
    root: string,
    sha: string,
    relPath: string,
  ): Promise<{ objectId: string; size: number } | null> {
    const spec = `${sha}:${relPath}`;
    const idRes = await this.git.run(root, [
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      spec,
    ]);
    if (idRes.exitCode !== 0) return null;
    const objectId = idRes.stdout.trim();
    if (objectId.length === 0) return null;
    const sizeRes = await this.git.run(root, ["cat-file", "-s", objectId]);
    if (sizeRes.exitCode !== 0) return null;
    const size = Number.parseInt(sizeRes.stdout.trim(), 10);
    if (Number.isNaN(size) || size < 0) return null;
    return { objectId, size };
  }

  showBlobRange(
    root: string,
    objectId: string,
    start: number,
    end: number,
  ): NodeJS.ReadableStream {
    const { stream, kill } = spawnCatFileBlob(root, objectId);
    return windowStream(stream, kill, start, end);
  }
}

function spawnCatFileBlob(
  root: string,
  objectId: string,
): { stream: NodeJS.ReadableStream; kill: () => void } {
  const { child, kill } = spawnGitDetached(
    ["git", "-C", root, "cat-file", "blob", objectId],
    { timeoutMs: BLOB_TIMEOUT_MS, stderr: false },
  );
  return { stream: child.stdout, kill };
}

export function windowStream(
  src: NodeJS.ReadableStream,
  kill: () => void,
  start: number,
  end: number,
): NodeJS.ReadableStream {
  let pos = 0;
  const want = end - start + 1;
  let emitted = 0;
  let done = false;
  const finish = (t: Transform): void => {
    if (done) return;
    done = true;
    kill();
    src.unpipe(t);
    if (typeof (src as NodeJS.ReadStream).destroy === "function") {
      (src as NodeJS.ReadStream).destroy();
    }
    t.end();
  };
  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (done || emitted >= want) {
        cb();
        return;
      }
      const chunkStart = pos;
      pos += chunk.length;
      const from = Math.max(0, start - chunkStart);
      if (from >= chunk.length) {
        cb();
        return;
      }
      const remaining = want - emitted;
      const slice = chunk.subarray(
        from,
        Math.min(chunk.length, from + remaining),
      );
      emitted += slice.length;
      if (emitted >= want) {
        this.push(slice);
        finish(this);
        cb();
        return;
      }
      cb(null, slice);
    },
  });
  src.on("error", (err) => t.destroy(err));
  src.pipe(t);
  return t;
}
