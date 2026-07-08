import type { ReconcileDeps } from "./reconcile/StartupReconciler.js";
import { StartupReconciler } from "./reconcile/StartupReconciler.js";

export type { ReconcileDeps };

// On kernel startup, scan tmux for F-Mark-owned sessions and cross-reference
// with .f-mark/agents/. Three cases:
//
//   CASE A: agent dir + live tmux session -> mark managed pane + seed hook
//           install status in the presence tracker so the dashboard reflects
//           the surviving agent immediately.
//   CASE B: agent dir without live tmux session -> preserve resume-critical
//           files (tmux-session, runtime, active-session, runtime-session.json),
//           mark the pane detached/dead, and append at most one pane-died log.
//   CASE C: agent tmux session without a corresponding agent dir -> kill the
//           orphaned tmux session.
//
// Terminal sessions are always kept as-is. If tmux is unavailable (no version),
// reconcile is a no-op so the rest of the kernel can still come up.
export async function reconcile(deps: ReconcileDeps): Promise<void> {
  await new StartupReconciler(deps).run();
}
