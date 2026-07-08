import type { TmuxManager } from "../../tmux/manager.js";
import { terminalPollerKeyFor } from "./runtimeArgs.js";
import type { ManagedAgentTerminalAccessService } from "./terminalAccessService.js";
import type { ManagedAgentRootBinding } from "./types.js";

const TERMINAL_PROMPT_POLL_MS = 1000;
const TERMINAL_PROMPT_POLL_TTL_MS = 5 * 60 * 1000;

interface ManagedAgentTerminalPollingDeps {
  tmux: TmuxManager;
  terminalAccessService: ManagedAgentTerminalAccessService;
  bindingFor(
    binding?: ManagedAgentRootBinding | null,
  ): ManagedAgentRootBinding;
}

export class ManagedAgentTerminalPolling {
  private readonly pollers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly deps: ManagedAgentTerminalPollingDeps) {}

  schedule(input: {
    participantId: string;
    runtimeId: string | null;
    /* Root binding so a background-root wake polls and publishes terminal
       access prompts under the SAME root, not the active path. */
    binding?: ManagedAgentRootBinding | null;
  }): void {
    const pollerKey = this.pollerKey(input.participantId, input.binding);
    if (this.pollers.has(pollerKey)) return;
    const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      try {
        const bound = this.deps.bindingFor(input.binding);
        const state = bound.state;
        const tmuxSession = await state.readTmuxSession(input.participantId);
        if (
          tmuxSession === null ||
          !(await this.deps.tmux.paneAlive(tmuxSession))
        ) {
          this.pollers.delete(pollerKey);
          return;
        }
        await this.deps.terminalAccessService.publish({
          participantId: input.participantId,
          runtimeId: input.runtimeId,
          tmuxSession,
          binding: input.binding,
        });
      } catch {
        /* Terminal prompt detection is best-effort; hooks remain canonical. */
      }
      if (Date.now() - startedAt >= TERMINAL_PROMPT_POLL_TTL_MS) {
        this.pollers.delete(pollerKey);
        return;
      }
      const timer = setTimeout(tick, TERMINAL_PROMPT_POLL_MS);
      timer.unref?.();
      this.pollers.set(pollerKey, timer);
    };
    const timer = setTimeout(tick, TERMINAL_PROMPT_POLL_MS);
    timer.unref?.();
    this.pollers.set(pollerKey, timer);
  }

  /* Poller map key. A participant id alone collides across roots - the same id
     can exist under two different roots, and keying by participant only would
     let one root's poller suppress the other's scoped poller. */
  private pollerKey(
    participantId: string,
    binding?: ManagedAgentRootBinding | null,
  ): string {
    const bound = this.deps.bindingFor(binding);
    return terminalPollerKeyFor(
      bound.pathId ?? bound.tmuxRoot ?? "",
      participantId,
    );
  }
}
