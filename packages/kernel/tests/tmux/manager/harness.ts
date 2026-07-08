import type {
  CommandResult,
  FakeCommandRunner,
} from "../../../src/tmux/commandRunner.js";
import { fakeCommandRunner } from "../../../src/tmux/commandRunner.js";
import type { TmuxManager } from "../../../src/tmux/manager.js";
import { createTmuxManager } from "../../../src/tmux/manager.js";

export const root = "/home/user/proj-acme";

export function commandResult(
  overrides: Partial<CommandResult> = {},
): CommandResult {
  return { stdout: "", stderr: "", exitCode: 0, ...overrides };
}

export class TmuxManagerHarness {
  readonly runner: FakeCommandRunner;
  readonly manager: TmuxManager;

  constructor() {
    this.runner = fakeCommandRunner();
    this.manager = createTmuxManager({
      runner: this.runner,
      projectRoot: root,
      promptDelays: { settleMs: 0, confirmMs: 0 },
    });
  }

  get calls(): string[][] {
    return this.runner.calls;
  }

  expectTmux(command: string, result: CommandResult = commandResult()): void {
    this.expectCommand(["tmux", command], result);
  }

  expectCommand(prefix: string[], result: CommandResult): void {
    this.runner.expect(prefix, result);
  }

  verifyExpectationsConsumed(): void {
    this.runner.verifyExpectationsConsumed();
  }
}

export function createHarness(): TmuxManagerHarness {
  return new TmuxManagerHarness();
}
