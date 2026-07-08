import {
  fmarkSessionMatchesProjectRoot,
  projectRootHash,
} from "../naming.js";
import type { TmuxCommandClient } from "./commands.js";
import type { TmuxUserOptions } from "./options.js";
import {
  type ListedFmarkSession,
  parseFmarkSessionList,
  toListedFmarkSession,
} from "./sessionFilter.js";
import type { TmuxProjectState } from "./state.js";

export class TmuxSessionLister {
  constructor(
    private readonly commands: TmuxCommandClient,
    private readonly _options: TmuxUserOptions,
    private readonly state: TmuxProjectState,
  ) {}

  async list(root?: string): Promise<ListedFmarkSession[]> {
    const target = this.state.resolveProjectRoot(root);
    const targetHash = projectRootHash(target);
    const stdout = await this.commands.listSessions({ projectHash: targetHash });
    const verified: ListedFmarkSession[] = [];
    for (const candidate of parseFmarkSessionList(stdout)) {
      if (!fmarkSessionMatchesProjectRoot(candidate.sessionName, target)) continue;
      const listed = toListedFmarkSession(candidate);
      if (listed !== null) verified.push(listed);
    }
    return verified;
  }

  async isLiveSession(sessionName: string, root?: string): Promise<boolean> {
    const target = this.state.resolveProjectRoot(root);
    if (!fmarkSessionMatchesProjectRoot(sessionName, target)) return false;
    return this.commands.paneAlive(sessionName);
  }
}
