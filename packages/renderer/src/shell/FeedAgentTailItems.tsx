import type { JSX } from "react";
import { AgentWorkingStrip } from "./AgentWorkingStrip.js";
import type { FeedAgentTails } from "./useFeedAgentTails.js";

export function FeedAgentTailItems({
  tails,
}: {
  tails: FeedAgentTails;
}): JSX.Element {
  return (
    <>
      {tails.showRunningTail && (
        <div
          key="agent-ascii-running-tail"
          className="feed-item agent-ascii-tail-item"
          data-feed-chrome
        >
          <AgentWorkingStrip
            agentIds={tails.activeAgentIdList}
            blocked={tails.runningTailBlocked}
            turnStartMs={tails.turnStartMs}
            approvalPausedMs={tails.approvalClock.closedPauseMs}
            approvalPauseStartMs={tails.approvalClock.openPauseStartMs}
            action={tails.agentAction}
          />
        </div>
      )}
      {tails.showConnectingTail && (
        <div
          key="agent-ascii-connecting-tail"
          className="feed-item agent-ascii-tail-item"
          data-feed-chrome
        >
          <AgentWorkingStrip
            agentIds={tails.connectingAgentsForSession.map(
              (agent) => agent.participantId,
            )}
            participantSnapshots={tails.connectingSnapshots}
            blocked={false}
            turnStartMs={tails.connectingTurnStartMs}
            action="is connecting"
          />
        </div>
      )}
    </>
  );
}
