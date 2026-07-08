/* Hunk / file revert. This is the ONE place in the git layer
   that MUTATES the target repo: `git apply --reverse`, `git restore`,
   `git rm`, `git mv`, and `unlink`. It is intentionally separate from the
   read-only `service.ts` so that module's "nothing here mutates" contract
   holds.

   Security posture (carried from the read service):
     - every git call is array-args, never a shell string, run with `-C <root>`;
     - the base ref is `isSafeRef`-gated and passed after `--end-of-options`;
     - every path is wrapped as a literal pathspec after `--`, and unlink /
       rename leaf paths are resolved through the mutating-path guard.

   The server recomputes the diff and finds the hunk by id before calling this
   module. Client patch text is never trusted. */

import type { CommandRunner } from "../tmux/commandRunner.js";
import { realGitCommandRunner } from "./gitRunner.js";
import { GitRevertCommands } from "./revert/commands.js";
import { FileReverter } from "./revert/files.js";
import { HunkReverter } from "./revert/hunks.js";
import { GitRevertMutator } from "./revert/mutator.js";
import type { GitMutator } from "./revert/types.js";

export {
  HunkConflictError,
  RevertConflictError,
  RevertFailedError,
  RevertNotAllowedError,
} from "./revert/errors.js";
export type { GitMutator, RevertContext } from "./revert/types.js";

export function createGitMutator(
  runner: CommandRunner = realGitCommandRunner(),
): GitMutator {
  const git = new GitRevertCommands(runner);
  return new GitRevertMutator(new FileReverter(git), new HunkReverter(git));
}
