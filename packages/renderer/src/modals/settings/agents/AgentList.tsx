import type { JSX } from "react";
import type { SessionMeta } from "@f-mark/shared";
import type { AgentsController } from "./useAgentsController.js";
import { AgentCard } from "./AgentCard.js";

interface AgentListProps {
  controller: AgentsController;
}

export function AgentList({ controller }: AgentListProps): JSX.Element {
  if (controller.loading) {
    return (
      <div className="agent-list agent-list-loading" data-testid="agent-list">
        Loading connected agents…
      </div>
    );
  }

  if (controller.groups.length === 0) {
    return (
      <div className="agent-list agent-list-empty" data-testid="agent-list">
        No connected agents right now.
      </div>
    );
  }

  return (
    <div className="agent-list" data-testid="agent-list">
      {controller.groups.map((pathGroup) => (
        <section
          key={`${pathGroup.pathId ?? ""}:${pathGroup.path ?? "unknown"}`}
          className="agent-path-group"
        >
          <h4 className="agent-path-heading">{pathGroup.label}</h4>
          {pathGroup.path !== null ? (
            <div className="agent-path-meta">{pathGroup.path}</div>
          ) : null}
          {pathGroup.sessions.map((sessionGroup) => (
            <SessionGroup
              key={`${pathGroup.pathId ?? ""}:${pathGroup.path ?? ""}:${sessionGroup.sessionId ?? "none"}`}
              controller={controller}
              sessionGroup={sessionGroup}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function SessionGroup({
  controller,
  sessionGroup,
}: {
  controller: AgentsController;
  sessionGroup: {
    sessionId: string | null;
    sessionSlug: string;
    session: SessionMeta | null;
    agents: Parameters<typeof AgentCard>[0]["entry"][];
  };
}): JSX.Element {
  const canNavigate = sessionGroup.session !== null;
  return (
    <section
      className="agent-session-group"
      data-testid="agent-session-group"
      data-session-slug={sessionGroup.sessionSlug}
    >
      <div className="agent-session-head">
        <div className="agent-session-title">{sessionGroup.sessionSlug}</div>
        {canNavigate ? (
          <button
            type="button"
            className="btn-ghost agent-session-go"
            onClick={() => {
              controller.goToSession(sessionGroup.session!);
            }}
          >
            Go to session
          </button>
        ) : null}
      </div>
      <div className="agent-session-cards">
        {sessionGroup.agents.map((entry) => (
          <AgentCard
            key={`${entry.agent.participant_id}:${entry.pathId ?? entry.path ?? ""}`}
            entry={entry}
            busy={controller.busyAgentId === entry.agent.participant_id}
            onGoodbye={(selected) => {
              void controller.goodbye(selected);
            }}
          />
        ))}
      </div>
    </section>
  );
}
