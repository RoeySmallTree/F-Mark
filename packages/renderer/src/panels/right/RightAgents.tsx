import { useContext } from "react";
import { TopBarModalContext } from "../../app/topBarModalContext.js";
import { LoadingAnimation } from "../../components/LoadingAnimation.js";
import { RightAgentRow } from "./agents/RightAgentRow.js";
import { useRightAgentsController } from "./agents/useRightAgentsController.js";
import { TabEmptyState } from "./TabEmptyState.js";

const NO_LOOSE_STRING_VALUES = {
  agents: "agents",
  rightAgentsEmpty: "right-agents-empty",
} as const;

export function RightAgents(): JSX.Element {
  const modalCtx = useContext(TopBarModalContext);
  const controller = useRightAgentsController();
  const hasAgents =
    controller.agents.length > 0 || controller.removedAgents.length > 0;

  if (!hasAgents) {
    return (
      <>
        {controller.error !== null && (
          <p className="right-agents-error">{controller.error}</p>
        )}
        {controller.loading ? (
          <LoadingAnimation className="panel-loading" />
        ) : (
          <TabEmptyState
            variant={NO_LOOSE_STRING_VALUES.agents}
            fill
            className={NO_LOOSE_STRING_VALUES.rightAgentsEmpty}
            testId={NO_LOOSE_STRING_VALUES.rightAgentsEmpty}
          />
        )}
      </>
    );
  }

  return (
    <div className="right-agents" data-testid="right-agents">
      {controller.error !== null && (
        <p className="right-agents-error">{controller.error}</p>
      )}
      {controller.agents.length > 0 ? (
        <section className="right-agents-section" aria-label="Active agents">
          <h3>Active</h3>
          {controller.agents.map((agent) => (
            <RightAgentRow
              key={agent.participant_id}
              agent={agent}
              controller={controller}
              modalCtx={modalCtx}
            />
          ))}
        </section>
      ) : null}
      {controller.removedAgents.length > 0 ? (
        <section className="right-agents-section" aria-label="Removed agents">
          <h3>Removed</h3>
          {controller.removedAgents.map((agent) => (
            <RightAgentRow
              key={`${agent.participant_id}:removed`}
              agent={agent}
              controller={controller}
              modalCtx={modalCtx}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
