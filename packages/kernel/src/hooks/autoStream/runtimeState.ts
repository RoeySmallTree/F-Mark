import type { HookContext } from "../bootstrap.js";
import { getAdapter } from "../../runtimes/adapters/index.js";
import { postRuntimeState } from "../post.js";
import type { HookPayload } from "./types.js";

export class RuntimeStatePoster {
  async maybePost(input: {
    ctx: HookContext;
    participantId: string;
    runtimeId: string | null;
    payload: HookPayload;
  }): Promise<void> {
    const adapter = getAdapter(input.runtimeId);
    if (!adapter) return;
    try {
      const state = await adapter.readCurrent({
        transcriptPath: (input.payload as { transcript_path?: string })
          .transcript_path,
        cwd: (input.payload as { cwd?: string }).cwd,
      });
      if (state) await postRuntimeState(input.ctx, input.participantId, state);
    } catch {
      // best-effort; runtime state is a UX nice-to-have
    }
  }
}
