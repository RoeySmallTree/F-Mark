import type { ManagedAgent } from "@f-mark/shared";

export function managedAgentsEqual(a: ManagedAgent, b: ManagedAgent): boolean {
  return (
    a.participant_id === b.participant_id &&
    a.display_name === b.display_name &&
    a.tmux_session === b.tmux_session &&
    a.runtime_id === b.runtime_id &&
    a.active_session === b.active_session &&
    a.membership_session_id === b.membership_session_id &&
    a.membership_state === b.membership_state &&
    a.pane_lifecycle === b.pane_lifecycle &&
    a.controllable === b.controllable &&
    a.removed_at === b.removed_at &&
    a.removed_reason === b.removed_reason &&
    a.runtime_session === b.runtime_session &&
    a.alive === b.alive &&
    a.activity_state === b.activity_state &&
    a.runtime_state === b.runtime_state &&
    a.access_mode === b.access_mode
  );
}
