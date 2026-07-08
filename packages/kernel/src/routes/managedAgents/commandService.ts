import type { ManagedAgentCommandRequest } from "@f-mark/shared";
import { readEvents } from "../../events/reader.js";
import { validateMessageText, validateSlashCommand } from "../../runtimes/validation.js";
import { publishEventWrites } from "../../services/eventPublisher.js";
import { writeTurnEndEvent } from "../../services/events.js";
import type { InputQueue } from "../../tmux/inputQueue.js";
import type { TmuxManager } from "../../tmux/manager.js";
import type { Bus } from "../../ws/bus.js";
import type { ManagedAgentRootBinding } from "./types.js";

type CommandBody =
  | { ok: true }
  | { error: string }
  | { reason: "unmanaged_pane"; offer: "open_overlay" };

type CommandResult = {
  status: number;
  body: CommandBody;
};

function timestampFromFilename(filename: string): string | null {
  const timestamp = filename.split("_", 1)[0];
  return typeof timestamp === "string" && timestamp.length > 0 ? timestamp : null;
}

interface ManagedAgentCommandServiceDeps {
  tmux: TmuxManager;
  inputQueue: InputQueue;
  bus: Bus;
  scheduleTerminalAccessPolling(input: {
    participantId: string;
    runtimeId: string | null;
    binding?: ManagedAgentRootBinding | null;
  }): void;
  scheduleCodexLiveTextPolling(input: {
    participantId: string;
    sessionId: string | null | undefined;
    runtimeId: string | null | undefined;
    binding?: ManagedAgentRootBinding | null;
    reset?: boolean;
  }): void;
  publishAgentUpdated(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): Promise<void>;
}

export class ManagedAgentCommandService {
  constructor(private readonly deps: ManagedAgentCommandServiceDeps) {}

  async send(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
    body: Partial<ManagedAgentCommandRequest>;
  }): Promise<CommandResult> {
    const session = await input.binding.state.readTmuxSession(input.participantId);
    if (!session) {
      return {
        status: 409,
        body: { reason: "unmanaged_pane", offer: "open_overlay" },
      };
    }

    try {
      await this.dispatchCommand({
        participantId: input.participantId,
        binding: input.binding,
        session,
        body: input.body,
      });
      await this.recordCommand(input.participantId, input.binding, input.body);
      return { status: 200, body: { ok: true } };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 400, body: { error: msg } };
    }
  }

  private async dispatchCommand(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
    session: string;
    body: Partial<ManagedAgentCommandRequest>;
  }): Promise<void> {
    if (input.body.type === "interrupt") {
      await this.sendInterrupt(input);
      return;
    }
    if (input.body.type === "slash") {
      await this.sendSlash(input.session, input.body.command);
      return;
    }
    if (input.body.type === "message") {
      await this.sendMessage(input.session, input.body.text);
      return;
    }
    throw new Error("unknown command type");
  }

  private async sendInterrupt(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
    session: string;
  }): Promise<void> {
    await this.deps.inputQueue.enqueue(input.session, () =>
      this.deps.tmux.sendKey(input.session, "C-c"),
    );
    try {
      await this.emitInterruptTurnEnd(input);
    } catch {
      // Never let turn-end bookkeeping fail the interrupt itself.
    }
  }

  private async emitInterruptTurnEnd(input: {
    participantId: string;
    binding: ManagedAgentRootBinding;
  }): Promise<void> {
    const activeSession = await input.binding.state.readActiveSession(
      input.participantId,
    );
    if (activeSession === null || activeSession.length === 0) return;

    const events = await readEvents(input.binding.paths, activeSession, {});
    const last = events[events.length - 1];
    const alreadyEnded =
      last !== undefined &&
      last.kind === "turn-end" &&
      last.participant_id === input.participantId;
    if (alreadyEnded) return;

    const written = await writeTurnEndEvent(input.binding.paths, activeSession, {
      participant_id: input.participantId,
      source: "manual",
    });
    const timestamp = timestampFromFilename(written.response.filename);
    const now = new Date().toISOString();
    await input.binding.state.updateControlState(input.participantId, {
      activity_state: "turn-ended",
      last_activity_at: now,
    });
    if (timestamp !== null) {
      await input.binding.state.writeInboxCursor(
        input.participantId,
        activeSession,
        timestamp,
      );
    }
    publishEventWrites(
      this.deps.bus,
      activeSession,
      written.publish,
      this.publishScope(input.binding),
    );
    await this.deps.publishAgentUpdated(input.participantId, input.binding);
  }

  private async sendSlash(
    session: string,
    command: unknown,
  ): Promise<void> {
    if (typeof command !== "string") throw new Error("missing command");
    validateSlashCommand(command);
    await this.deps.inputQueue.enqueue(session, async () => {
      await this.deps.tmux.sendLiteralText(session, "/" + command);
      await this.deps.tmux.sendKey(session, "C-m");
    });
  }

  private async sendMessage(session: string, text: unknown): Promise<void> {
    if (typeof text !== "string") throw new Error("missing text");
    validateMessageText(text);
    await this.deps.inputQueue.enqueue(session, () =>
      this.deps.tmux.deliverPrompt(session, text),
    );
  }

  private async recordCommand(
    participantId: string,
    binding: ManagedAgentRootBinding,
    body: Partial<ManagedAgentCommandRequest>,
  ): Promise<void> {
    await binding.state.appendLog(participantId, {
      event: "command",
      type: body.type,
    });
    await binding.state.updateControlState(participantId, {
      ...(body.type !== "interrupt" ? { activity_state: "running" as const } : {}),
      last_activity_at: new Date().toISOString(),
      idle_stopped_at: null,
      idle_stop_reason: null,
      pane_lifecycle: "live",
    });
    const runtimeId = await binding.state.readRuntime(participantId);
    const sessionId = await binding.state.readActiveSession(participantId);
    this.deps.scheduleTerminalAccessPolling({
      participantId,
      runtimeId,
      binding,
    });
    this.deps.scheduleCodexLiveTextPolling({
      participantId,
      sessionId,
      runtimeId,
      binding,
    });
    await this.deps.publishAgentUpdated(participantId, binding);
  }

  private publishScope(
    binding: ManagedAgentRootBinding,
  ): { pathId: string; revision?: number } | undefined {
    if (binding.pathId === undefined) return undefined;
    return {
      pathId: binding.pathId,
      ...(binding.revision !== undefined ? { revision: binding.revision } : {}),
    };
  }
}
