import type { TmuxManager } from "../../../tmux/manager.js";
import type { ManagedAgentRootBinding } from "../types.js";

function projectRootForBinding(binding: ManagedAgentRootBinding): string {
  return binding.tmuxRoot ?? binding.paths.root();
}

export async function readLiveTmuxSession(input: {
  tmux: TmuxManager;
  binding: ManagedAgentRootBinding;
  participantId: string;
  liveTmuxSessions?: ReadonlySet<string>;
}): Promise<string | null> {
  const currentTmuxSession = await input.binding.state.readTmuxSession(
    input.participantId,
  );
  if (currentTmuxSession === null) return null;

  if (input.liveTmuxSessions !== undefined) {
    return input.liveTmuxSessions.has(currentTmuxSession)
      ? currentTmuxSession
      : null;
  }

  return (await input.tmux.isLiveFmarkSession(
    currentTmuxSession,
    projectRootForBinding(input.binding),
  ))
    ? currentTmuxSession
    : null;
}
