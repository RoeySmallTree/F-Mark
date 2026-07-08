import { createReadStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TmuxManager } from "../../tmux/manager.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import type { PaneHub } from "../paneHub.js";
import { bestEffortRmdir, bestEffortUnlink, mkfifo } from "./files.js";

interface PipeState {
  fifoPath: string;
  fifoDir: string;
  stream: ReturnType<typeof createReadStream>;
}

interface PanePipeControllerDeps {
  tmux: TmuxManager;
  hub: PaneHub;
  pipeQueue: InputQueue;
}

export class PanePipeController {
  private readonly pipes = new Map<string, PipeState>();

  constructor(private readonly deps: PanePipeControllerDeps) {}

  async startPipe(paneId: string): Promise<void> {
    await this.deps.pipeQueue.enqueue(paneId, () => this.startPipeNow(paneId));
  }

  async stopPipe(paneId: string): Promise<void> {
    await this.deps.pipeQueue.enqueue(paneId, () => this.stopPipeNow(paneId));
  }

  private async startPipeNow(paneId: string): Promise<void> {
    if (this.pipes.has(paneId)) return;
    const dir = await mkdtemp(join(tmpdir(), "fmark-pipe-"));
    const fifo = join(dir, "fifo");
    let mkfifoOk = false;
    try {
      await mkfifo(fifo);
      mkfifoOk = true;
      await this.deps.tmux.startPipePane(paneId, fifo);
      this.pipes.set(paneId, {
        fifoPath: fifo,
        fifoDir: dir,
        stream: this.openPipeStream(paneId, fifo),
      });
    } catch (error) {
      await this.rollbackStart(paneId, fifo, dir, mkfifoOk);
      throw error;
    }
  }

  private async stopPipeNow(paneId: string): Promise<void> {
    const state = this.pipes.get(paneId);
    if (!state) return;
    this.pipes.delete(paneId);
    await this.tearDown(paneId, state, true);
  }

  private openPipeStream(
    paneId: string,
    fifoPath: string,
  ): PipeState["stream"] {
    const stream = createReadStream(fifoPath, { encoding: "utf8" });
    stream.on("data", (chunk) => this.deps.hub.feed(paneId, String(chunk)));
    stream.on("error", () => {
      void this.stopPipe(paneId);
    });
    stream.on("end", () => {
      void this.stopPipe(paneId);
    });
    return stream;
  }

  private async rollbackStart(
    paneId: string,
    fifoPath: string,
    fifoDir: string,
    attemptTmuxStop: boolean,
  ): Promise<void> {
    if (attemptTmuxStop) {
      try {
        await this.deps.tmux.stopPipePane(paneId);
      } catch {
        // ignore rollback failure
      }
      await bestEffortUnlink(fifoPath);
    }
    await bestEffortRmdir(fifoDir);
  }

  private async tearDown(
    paneId: string,
    state: PipeState,
    attemptTmuxStop: boolean,
  ): Promise<void> {
    try {
      state.stream.destroy();
    } catch {
      // fall through
    }
    if (attemptTmuxStop) {
      try {
        await this.deps.tmux.stopPipePane(paneId);
      } catch {
        // fall through
      }
    }
    await bestEffortUnlink(state.fifoPath);
    await bestEffortRmdir(state.fifoDir);
  }
}
