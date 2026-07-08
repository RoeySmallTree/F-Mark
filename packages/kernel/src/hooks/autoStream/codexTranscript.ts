import type { Dirent } from "node:fs";
import { open, readdir, stat } from "fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HookPayload } from "./types.js";
import { stringField } from "./fields.js";

interface CodexRolloutMeta {
  id?: string;
  cwd?: string;
}

class CodexRolloutScanner {
  private readonly found: Array<{ path: string; mtime: number }> = [];

  constructor(private readonly root: string) {}

  async listRecent(limit = 50): Promise<string[]> {
    await this.walk(this.root, 0);
    this.found.sort((a, b) => b.mtime - a.mtime);
    return this.found.slice(0, limit).map((item) => item.path);
  }

  private async walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    const entries = await this.readEntries(dir);
    await Promise.all(
      entries.map((entry) => this.visitEntry(dir, depth, entry)),
    );
  }

  private async readEntries(dir: string): Promise<Dirent[]> {
    try {
      return await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  private async visitEntry(
    dir: string,
    depth: number,
    entry: Dirent,
  ): Promise<void> {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await this.walk(full, depth + 1);
      return;
    }
    if (!this.isRolloutFile(entry)) return;
    await this.rememberFile(full);
  }

  private isRolloutFile(entry: Dirent): boolean {
    return (
      entry.isFile() &&
      entry.name.startsWith("rollout-") &&
      entry.name.endsWith(".jsonl")
    );
  }

  private async rememberFile(path: string): Promise<void> {
    try {
      const info = await stat(path);
      this.found.push({ path, mtime: info.mtimeMs });
    } catch {
      // Ignore files that disappear while Codex is rotating sessions.
    }
  }
}

export class CodexTranscriptResolver {
  async resolve(input: {
    env: NodeJS.ProcessEnv;
    payload: HookPayload;
    cwd: string;
    runtimeId: string | null;
  }): Promise<string | null> {
    const explicit = stringField(input.payload, "transcript_path");
    if (explicit !== undefined) return explicit;
    if (input.runtimeId !== "codex") return null;
    return this.findFallback(input);
  }

  async findFallback(input: {
    env: NodeJS.ProcessEnv;
    payload: HookPayload;
    cwd: string;
  }): Promise<string | null> {
    const runtimeSessionId = stringField(input.payload, "session_id");
    let newestForCwd: string | null = null;
    for (const file of await this.listRecentRollouts(input.env)) {
      const meta = await this.readMeta(file);
      if (meta === null) continue;
      if (runtimeSessionId !== undefined && meta.id === runtimeSessionId) {
        return file;
      }
      if (newestForCwd === null && meta.cwd === input.cwd) newestForCwd = file;
    }
    return newestForCwd;
  }

  async readMeta(path: string): Promise<CodexRolloutMeta | null> {
    const first = await this.readFirstLine(path);
    if (first === undefined) return null;
    return this.parseMeta(first);
  }

  private listRecentRollouts(env: NodeJS.ProcessEnv): Promise<string[]> {
    return new CodexRolloutScanner(this.sessionsRoot(env)).listRecent();
  }

  private sessionsRoot(env: NodeJS.ProcessEnv): string {
    const home = env.CODEX_HOME;
    return join(
      typeof home === "string" && home.trim().length > 0
        ? home
        : join(homedir(), ".codex"),
      "sessions",
    );
  }

  private async readFirstLine(path: string): Promise<string | undefined> {
    try {
      const handle = await open(path, "r");
      try {
        const buffer = Buffer.alloc(64 * 1024);
        const result = await handle.read(buffer, 0, buffer.length, 0);
        return buffer
          .subarray(0, result.bytesRead)
          .toString("utf8")
          .split("\n")
          .find((line) => line.trim().length > 0);
      } finally {
        await handle.close();
      }
    } catch {
      return undefined;
    }
  }

  private parseMeta(firstLine: string): CodexRolloutMeta | null {
    try {
      const entry = JSON.parse(firstLine) as {
        type?: string;
        payload?: { id?: unknown; cwd?: unknown };
      };
      if (entry.type !== "session_meta") return null;
      return {
        id: typeof entry.payload?.id === "string" ? entry.payload.id : undefined,
        cwd:
          typeof entry.payload?.cwd === "string" ? entry.payload.cwd : undefined,
      };
    } catch {
      return null;
    }
  }
}
