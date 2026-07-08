import type { JSX } from "react";
import { ProviderCard } from "./ProviderCard.js";
import type { AgentLauncherController } from "./types.js";

export function AgentLauncherView({
  controller,
}: {
  controller: AgentLauncherController;
}): JSX.Element {
  return (
    <section className="feed-col agent-launcher-col" aria-label="Agent launcher">
      <div className="agent-launcher-scroll">
        <div className="agent-launcher-inner">
          <header className="agent-launcher-header">
            <div className="agent-launcher-eyebrow">
              EMPTY — NO AGENT CONNECTED
            </div>
            <h1 className="agent-launcher-title">Add a coding agent</h1>
            <p className="agent-launcher-subtitle">
              F-Mark routes your messages to your CLI agent of choice. Pick one
              to start.
            </p>
          </header>

          {controller.runtimes.length === 0 ? (
            <div className="agent-launcher-empty">
              No runtimes registered. Open{" "}
              <button
                type="button"
                onClick={controller.onManageRuntimes}
                className="agent-launcher-link"
              >
                runtime settings
              </button>{" "}
              to add one.
            </div>
          ) : (
            <div className="agent-launcher-cards">
              {controller.runtimes.map((runtime) => (
                <ProviderCard
                  key={runtime.runtime.id}
                  model={runtime}
                  disabled={controller.disabled}
                  onSpawnRuntime={controller.onSpawnRuntime}
                  onConfigureRuntime={controller.onConfigureRuntime}
                  onAccessModeChange={controller.onAccessModeChange}
                  onModelChange={controller.onModelChange}
                  onEffortChange={controller.onEffortChange}
                />
              ))}
            </div>
          )}

          {controller.spawnError !== null ? (
            <div className="agent-launcher-error" role="alert">
              {controller.spawnError}
            </div>
          ) : null}

          <div className="agent-launcher-footer">
            Using a different agent?{" "}
            <button
              type="button"
              onClick={controller.onOpenRuntimeSettings}
              className="agent-launcher-link"
            >
              Configure manually →
            </button>
          </div>
        </div>
      </div>

      <div className="agent-launcher-compose-preview">
        <div className="agent-launcher-compose-preview-shell">
          <div className="agent-launcher-compose-preview-inner">
            Connect an agent above to send your first message…
          </div>
        </div>
      </div>
    </section>
  );
}
