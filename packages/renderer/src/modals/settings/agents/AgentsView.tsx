import type { JSX } from "react";
import type { AgentsController } from "./useAgentsController.js";
import { AgentList } from "./AgentList.js";

interface AgentsViewProps {
  controller: AgentsController;
}

export function AgentsView({ controller }: AgentsViewProps): JSX.Element {
  return (
    <>
      <h3 className="settings-h">Connected agents</h3>
      <div className="settings-sub">
        Live managed agents with an active tmux pane, grouped by session and
        project path.
      </div>

      {controller.error !== null ? (
        <div className="form-error" role="alert">
          {controller.error}
        </div>
      ) : null}

      <AgentList controller={controller} />
    </>
  );
}
