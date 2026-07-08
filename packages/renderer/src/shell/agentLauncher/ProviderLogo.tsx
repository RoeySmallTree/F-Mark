import type { JSX } from "react";
import { runtimeProviderVisual } from "../../runtimes.js";
import { avatarKind } from "../../components/ParticipantAvatar.js";
import { AgentKindArt } from "../../components/participantAvatar/AgentKindArt.js";
import type { AgentSpawnRuntime } from "../../hooks/useAgentSpawn.js";

const NO_LOOSE_STRING_VALUES = {
  icon: "icon",
  agent: "agent",
} as const;

export function ProviderLogo({
  runtime,
}: {
  runtime: AgentSpawnRuntime;
}): JSX.Element {
  const visual = runtimeProviderVisual(runtime.id, runtime.displayName);

  return (
    <div className="provider-logo-shell" aria-hidden>
      <div
        className="provider-logo-inner"
        data-provider-mark={
          visual.type === NO_LOOSE_STRING_VALUES.icon ? visual.icon.kind : "initials"
        }
      >
        {visual.type === NO_LOOSE_STRING_VALUES.icon ? (
          <AgentKindArt
            kind={avatarKind({
              kind: NO_LOOSE_STRING_VALUES.agent,
              runtimeId: runtime.id,
              name: runtime.displayName,
            })}
            className="provider-logo-art"
          />
        ) : (
          <span data-provider-initials={visual.initials}>
            {visual.initials}
          </span>
        )}
      </div>
    </div>
  );
}
