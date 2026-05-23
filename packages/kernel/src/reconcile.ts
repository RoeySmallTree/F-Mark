import type { Paths } from "./paths.js";
import type { TmuxManager } from "./tmux/manager.js";
import type { PresenceTracker } from "./presence/tracker.js";
import {
  listManagedAgentIds,
  readTmuxSession,
  clearManagedSiblings,
  readRuntime,
} from "./agents/managed.js";
import { appendAgentLog } from "./agents/logs.js";
import { checkHookInstallStatus } from "./hooksInstall/index.js";
import { listParticipants } from "./participants.js";

export interface ReconcileDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
}

// On kernel startup, scan tmux for F-Mark-owned sessions and cross-reference
// with .f-mark/agents/. Three cases:
//
//   CASE A: agent dir + live tmux session -> mark managed pane + seed hook
//           install status in the presence tracker so the dashboard reflects
//           the surviving agent immediately.
//   CASE B: agent dir without live tmux session -> clear sibling files
//           (tmux-session, runtime), clear the tracker's managed-pane closure,
//           and append a pane-died log entry.
//   CASE C: agent tmux session without a corresponding agent dir -> kill the
//           orphaned tmux session.
//
// Terminal sessions are always kept as-is. If tmux is unavailable (no version),
// reconcile is a no-op so the rest of the kernel can still come up.
export async function reconcile(deps: ReconcileDeps): Promise<void> {
  const { paths, tmux, tracker } = deps;

  const ver = await tmux.getVersion();
  if (!ver) return; // tmux unavailable; feature disabled

  const sessions = await tmux.listFmarkSessions();
  const liveAgentSessions = new Set<string>();
  for (const s of sessions) {
    if (s.kind === "agent" && s.participantId) liveAgentSessions.add(s.sessionName);
  }

  const agentIds = await listManagedAgentIds(paths.fmarkDir());
  const agentIdsSet = new Set(agentIds);

  // Find one user participant id for hook-install-status lookups. Best-effort:
  // if the project config is unreadable, fall back to the default `us-unknown`
  // used by checkHookInstallStatus.
  let userParticipantId: string | undefined;
  try {
    const parts = await listParticipants(paths);
    for (const [id, p] of Object.entries(parts)) {
      if (p.kind === "user") {
        userParticipantId = id;
        break;
      }
    }
  } catch {
    // ignore — best-effort
  }

  // CASE A & B: walk managed agent dirs.
  for (const aid of agentIds) {
    const expected = await readTmuxSession(paths.fmarkDir(), aid);
    if (expected && liveAgentSessions.has(expected)) {
      // CASE A: surviving managed agent. We already verified the session is
      // live above, so a constant `true` paneAlive closure is sufficient for
      // the initial seeding; the regular watcher loop will refresh it.
      tracker.setManagedPane(aid, { paneAlive: () => true });

      const runtimeId = await readRuntime(paths.fmarkDir(), aid);
      if (runtimeId) {
        try {
          const status = await checkHookInstallStatus({
            runtimeId,
            participantId: aid,
            userParticipantId,
            projectRoot: paths.root(),
          });
          if (status.installed) {
            // Hooks are installed but we have no recent ping — surface as
            // "stale" until the next ping flips state back to "online".
            // Note: this also (re)sets paneAlive, which is fine.
            tracker.markReconciledStale(aid, { paneAlive: () => true });
          } else {
            tracker.setManagedHookStatus(aid, false);
          }
        } catch {
          // unknown runtime — leave hook status unset
        }
      }
    } else {
      // CASE B: agent dir exists but no live tmux session.
      await clearManagedSiblings(paths.fmarkDir(), aid);
      // Surface the dead pane to the tracker so the dashboard shows it as
      // "pane-dead" (not "launching" or absent). markPaneDead also creates
      // the entry on cold startup when none existed before.
      tracker.markPaneDead(aid);
      try {
        await appendAgentLog(paths.fmarkDir(), aid, { event: "pane-died" });
      } catch {
        // best-effort log
      }
    }
  }

  // CASE C: orphan agent sessions (tmux exists but no agent dir).
  for (const s of sessions) {
    if (
      s.kind === "agent" &&
      s.participantId &&
      !agentIdsSet.has(s.participantId)
    ) {
      try {
        await tmux.killSession(s.sessionName);
      } catch {
        // best-effort
      }
    }
  }

  // Terminal sessions are kept as-is.
}
