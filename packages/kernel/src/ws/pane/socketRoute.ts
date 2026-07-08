import type { FastifyInstance } from "fastify";
import type { TmuxManager } from "../../tmux/manager.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import { validateMessageText } from "../../runtimes/validation.js";
import type { PaneHub } from "../paneHub.js";

interface PaneSocketRouteDeps {
  tmux: TmuxManager;
  hub: PaneHub;
  inputQueue: InputQueue;
}

interface PaneSocket {
  close(code?: number, reason?: string): void;
  send(data: string): void;
  on(event: "message", handler: (raw: Buffer) => void | Promise<void>): void;
  on(event: "close" | "error", handler: () => void): void;
}

export function registerPaneSocketRoute(
  instance: FastifyInstance,
  deps: PaneSocketRouteDeps,
): void {
  instance.get("/ws/pane", { websocket: true }, async (socket, req) => {
    await new PaneSocketHandler(socket as PaneSocket, req.url, deps).open();
  });
}

class PaneSocketHandler {
  private paneId: string | null = null;

  constructor(
    private readonly socket: PaneSocket,
    private readonly rawUrl: string | undefined,
    private readonly deps: PaneSocketRouteDeps,
  ) {}

  async open(): Promise<void> {
    const url = new URL(this.rawUrl ?? "/", "http://internal");
    this.paneId = url.searchParams.get("session");
    if (!this.paneId) {
      this.socket.close(1008, "session query param required");
      return;
    }
    if (!(await this.sendInitialSnapshot(url))) return;
    this.subscribeToHub();
    this.socket.on("message", (raw) => this.handleMessage(raw));
  }

  private async sendInitialSnapshot(url: URL): Promise<boolean> {
    const paneId = this.paneId!;
    try {
      await this.resizeFromQuery(url, paneId);
      this.send("pane.snapshot", await this.deps.tmux.captureSnapshot(paneId));
      return true;
    } catch (error) {
      this.sendError((error as Error).message);
      this.socket.close(1011, "snapshot failed");
      return false;
    }
  }

  private async resizeFromQuery(url: URL, paneId: string): Promise<void> {
    const cols = Number(url.searchParams.get("cols"));
    const rows = Number(url.searchParams.get("rows"));
    if (
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols >= 20 &&
      rows >= 5
    ) {
      await this.deps.tmux.resize(paneId, cols, rows);
    }
  }

  private subscribeToHub(): void {
    const paneId = this.paneId!;
    const sub = this.deps.hub.subscribe(paneId, (chunk) => {
      this.trySend({ type: "pane.data", data: chunk });
    });
    this.socket.on("close", () => sub.unsubscribe());
    this.socket.on("error", () => sub.unsubscribe());
  }

  private async handleMessage(raw: Buffer): Promise<void> {
    const message = this.parseMessage(raw);
    if (message === null || this.paneId === null) return;
    try {
      await this.dispatchMessage(message, this.paneId);
    } catch (error) {
      this.sendError((error as Error).message);
    }
  }

  private parseMessage(raw: Buffer): Record<string, unknown> | null {
    try {
      return JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private async dispatchMessage(
    message: Record<string, unknown>,
    paneId: string,
  ): Promise<void> {
    if (message.type === "pane.input" && typeof message.data === "string") {
      validateMessageText(message.data);
      await this.deps.inputQueue.enqueue(paneId, () =>
        this.deps.tmux.sendLiteralText(paneId, message.data as string),
      );
    } else if (message.type === "pane.key" && typeof message.key === "string") {
      await this.deps.inputQueue.enqueue(paneId, () =>
        this.deps.tmux.sendKey(paneId, message.key as string),
      );
    } else if (message.type === "pane.resize") {
      await this.deps.inputQueue.enqueue(paneId, () =>
        this.deps.tmux.resize(
          paneId,
          Number(message.cols),
          Number(message.rows),
        ),
      );
    }
  }

  private send(type: "pane.snapshot", data: string): void {
    this.socket.send(JSON.stringify({ type, data }));
  }

  private sendError(error: string): void {
    this.trySend({ type: "pane.error", error });
  }

  private trySend(message: unknown): void {
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // client already gone
    }
  }
}
