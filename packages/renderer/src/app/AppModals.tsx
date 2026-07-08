import { lazy, Suspense, useCallback, useMemo } from "react";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { LazyBoundary } from "../components/LazyBoundary.js";
import { IntegrationSetupModal } from "../modals/IntegrationSetupModal.js";
import { ReconnectModal } from "../modals/ReconnectModal.js";
import { OnboardingModal } from "../modals/onboarding/OnboardingModal.js";
import { useAgentSpawnContext } from "../hooks/useAgentSpawn.js";
import { useStore } from "../state/store.js";
import { useOnboardingGate } from "./useOnboardingGate.js";
import type { TopBarModalState } from "./useTopBarModals.js";

/* Lazy-loaded: TerminalOverlay statically pulls in @xterm/xterm (~477 KB
   minified) + @xterm/addon-fit + xterm's CSS. Code-splitting keeps all of that
   out of the main bundle so it only downloads when a terminal is actually
   opened (most sessions never open one). Stale-chunk failures self-heal via
   installStaleChunkReload() — see main.tsx. Do not switch to a static import. */
const TerminalOverlay = lazy(() =>
  import("../modals/TerminalOverlay.js").then((m) => ({
    default: m.TerminalOverlay,
  })),
);

function TerminalOverlayMount({
  topBarModals,
  token,
  baseUrl,
}: {
  topBarModals: TopBarModalState;
  token: string | null;
  baseUrl: string;
}): JSX.Element | null {
  if (topBarModals.terminalOverlayFor === null) return null;
  return (
    <LazyBoundary>
      <Suspense fallback={null}>
        <TerminalOverlay
          tmuxSession={topBarModals.terminalOverlayFor}
          token={token}
          baseUrl={baseUrl}
          onClose={topBarModals.closeTerminalOverlay}
        />
      </Suspense>
    </LazyBoundary>
  );
}

function ReconnectMount({
  topBarModals,
  token,
  baseUrl,
}: {
  topBarModals: TopBarModalState;
  token: string | null;
  baseUrl: string;
}): JSX.Element | null {
  if (topBarModals.reconnectFor === null) return null;
  return (
    <ReconnectModal
      participantId={topBarModals.reconnectFor.participantId}
      sessionId={topBarModals.reconnectFor.sessionId}
      runtimeId={topBarModals.reconnectFor.runtimeId}
      baseUrl={baseUrl}
      token={token}
      onClose={topBarModals.closeReconnect}
    />
  );
}

function IntegrationSetupMount({
  currentSessionId,
  apiClient,
}: {
  currentSessionId: string | null;
  apiClient: ReturnType<typeof createManagedAgentsClient>;
}): JSX.Element | null {
  const agentSpawn = useAgentSpawnContext();
  const setup = agentSpawn.integrationSetupFor;
  const closeIntegrationSetup = useCallback(
    () => agentSpawn.setIntegrationSetupFor(null),
    [agentSpawn],
  );

  if (setup === null) return null;
  return (
    <IntegrationSetupModal
      runtimeId={setup.runtimeId}
      participantId={setup.participantId}
      sessionId={currentSessionId ?? undefined}
      suggestedName={setup.suggestedName}
      rootScope={setup.rootScope}
      accessMode={agentSpawn.accessModeForRuntime(setup.runtimeId)}
      accessModeOptions={agentSpawn.accessModeOptionsForRuntime(setup.runtimeId)}
      onAccessModeChange={(mode) =>
        agentSpawn.setAccessModeForRuntime(setup.runtimeId, mode)
      }
      model={agentSpawn.modelForRuntime(setup.runtimeId)}
      effort={agentSpawn.effortForRuntime(setup.runtimeId)}
      modelOptions={agentSpawn.modelOptionsForRuntime(setup.runtimeId)}
      effortOptions={agentSpawn.effortOptionsForRuntime(setup.runtimeId)}
      onModelChange={(model) =>
        agentSpawn.setModelForRuntime(setup.runtimeId, model)
      }
      onEffortChange={(effort) =>
        agentSpawn.setEffortForRuntime(setup.runtimeId, effort)
      }
      initialPreflight={setup.preflight}
      apiClient={apiClient}
      onClose={closeIntegrationSetup}
      onLaunched={(resp) => {
        const currentSetup = agentSpawn.integrationSetupFor;
        if (currentSetup === null) return;
        const { suggestedName, color } = currentSetup;
        agentSpawn.setIntegrationSetupFor(null);
        agentSpawn.onSpawnComplete(resp, suggestedName, color);
      }}
    />
  );
}

function OnboardingMount(): JSX.Element | null {
  const { onboardingOpen, closeOnboarding } = useOnboardingGate();
  return onboardingOpen ? <OnboardingModal onClose={closeOnboarding} /> : null;
}

export function AppModals({
  topBarModals,
}: {
  topBarModals: TopBarModalState;
}): JSX.Element {
  const token = useStore((s) => s.token);
  const currentSessionId = useStore((s) => s.currentSessionId);

  const apiClient = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );

  /* Resolve a base URL string for modals that need to derive ws:// or
     fetch raw markdown. Empty in dev — same-origin proxying handles it. */
  const baseUrl = "";

  return (
    <>
      <TerminalOverlayMount
        topBarModals={topBarModals}
        token={token}
        baseUrl={baseUrl}
      />
      <ReconnectMount
        topBarModals={topBarModals}
        token={token}
        baseUrl={baseUrl}
      />
      <IntegrationSetupMount
        currentSessionId={currentSessionId}
        apiClient={apiClient}
      />
      <OnboardingMount />
    </>
  );
}
