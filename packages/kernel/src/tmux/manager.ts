// packages/kernel/src/tmux/manager.ts
import type { CommandRunner } from "./commandRunner.js";
import { TmuxCommandClient } from "./manager/commands.js";
import { TmuxUserOptions } from "./manager/options.js";
import type { ListedFmarkSession } from "./manager/sessionFilter.js";
import { TmuxSessionLauncher } from "./manager/sessionLauncher.js";
import { TmuxSessionLister } from "./manager/sessionLister.js";
import { TmuxProjectState } from "./manager/state.js";

export { parseTmuxSessionListLine } from "./manager/sessionFilter.js";

export interface TmuxManager {
  spawnAgent(input: {
    participantId: string;
    executable: string;
    args: string[];
    env?: Record<string, string>;
    projectRoot?: string;
  }): Promise<{ sessionName: string }>;
  spawnTerminal(input: { index: number }): Promise<{ sessionName: string }>;
  /* List F-Mark tmux sessions for one project root. Uses the project hash
     embedded in session names plus an optional tmux `-f` filter — never walks
     unrelated sessions or calls show-options per candidate. */
  listFmarkSessions(root?: string): Promise<ListedSession[]>;
  /** True when `sessionName` belongs to `root` and its pane is alive. */
  isLiveFmarkSession(sessionName: string, root?: string): Promise<boolean>;
  killSession(sessionName: string): Promise<void>;
  captureSnapshot(sessionName: string): Promise<string>;
  startPipePane(sessionName: string, fifo: string): Promise<void>;
  stopPipePane(sessionName: string): Promise<void>;
  sendLiteralText(sessionName: string, text: string): Promise<void>;
  sendKey(sessionName: string, key: string): Promise<void>;
  /* Deliver a (possibly multi-line) prompt into a TUI composer and submit it.
     Uses a bracketed paste (load-buffer + paste-buffer -p) so the TUI sees one
     atomic paste instead of a keystroke burst, waits for the paste to settle,
     then sends Enter — and a second confirm-Enter after another beat. TUIs
     with paste-burst heuristics (codex) otherwise swallow an Enter that lands
     inside the burst window, leaving the prompt unsubmitted in the composer;
     the confirm-Enter is a no-op on an already-submitted (empty) composer. */
  deliverPrompt(sessionName: string, text: string): Promise<void>;
  resize(sessionName: string, cols: number, rows: number): Promise<void>;
  paneAlive(sessionName: string): Promise<boolean>;
  getVersion(): Promise<{ major: number; minor: number; raw: string } | null>;
  getUserOption(sessionName: string, name: `@${string}`): Promise<string | null>;
  /* Update the project-root the manager scopes to. New spawns and listFmark
     filtering switch over; existing sessions keep their original @fmark-project
     tag so they remain visible from the old projectRoot only. Called from
     /paths/active after a multi-path switch. */
  rebind(input: { projectRoot: string }): void;
  /* Current projectRoot — exposed for tests and for diagnostic logging. */
  currentProjectRoot(): string;
}

export interface ListedSession extends ListedFmarkSession {}

export interface PromptDeliveryDelays {
  /** Pause between the paste landing and the submit Enter. */
  settleMs: number;
  /** Pause before the second, confirm Enter (no-op if already submitted). */
  confirmMs: number;
}

export const DEFAULT_PROMPT_DELIVERY_DELAYS: PromptDeliveryDelays = {
  settleMs: 250,
  confirmMs: 400,
};

let promptBufferCounter = 0;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

export function createTmuxManager(deps: {
  runner: CommandRunner;
  projectRoot: string;
  promptDelays?: PromptDeliveryDelays;
}): TmuxManager {
  const promptDelays = deps.promptDelays ?? DEFAULT_PROMPT_DELIVERY_DELAYS;
  const state = new TmuxProjectState(deps.projectRoot);
  const commands = new TmuxCommandClient(deps.runner);
  const options = new TmuxUserOptions(commands);
  const launcher = new TmuxSessionLauncher(commands, options, state);
  const lister = new TmuxSessionLister(commands, options, state);

  return {
    async spawnAgent(input) { return launcher.spawnAgent(input); },
    async spawnTerminal(input) { return launcher.spawnTerminal(input); },
    async listFmarkSessions(root) { return lister.list(root); },
    async isLiveFmarkSession(sessionName, root) {
      return lister.isLiveSession(sessionName, root);
    },

    async killSession(sessionName) {
      await commands.killSession(sessionName);
    },

    async captureSnapshot(sessionName) {
      return commands.captureSnapshot(sessionName);
    },

    async startPipePane(sessionName, fifo) {
      await commands.startPipePane(sessionName, fifo);
    },

    async stopPipePane(sessionName) {
      await commands.stopPipePane(sessionName);
    },

    async sendLiteralText(sessionName, text) {
      await commands.sendLiteralText(sessionName, text);
    },

    async sendKey(sessionName, key) {
      await commands.sendKey(sessionName, key);
    },

    async deliverPrompt(sessionName, text) {
      const bufferName = `fmark-prompt-${++promptBufferCounter}`;
      await commands.loadBuffer(bufferName, text);
      await commands.pasteBuffer(sessionName, bufferName);
      await sleep(promptDelays.settleMs);
      await commands.sendKey(sessionName, "C-m");
      await sleep(promptDelays.confirmMs);
      await commands.sendKey(sessionName, "C-m");
    },

    async resize(sessionName, cols, rows) {
      await commands.resize(sessionName, cols, rows);
    },

    async paneAlive(sessionName) {
      return commands.paneAlive(sessionName);
    },

    async getVersion() {
      return commands.getVersion();
    },

    async getUserOption(sessionName, name) { return options.get(sessionName, name); },

    rebind(input) { state.rebind(input); },
    currentProjectRoot() { return state.currentProjectRoot(); },
  };
}
