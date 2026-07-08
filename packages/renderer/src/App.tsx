import { AppLifecycle } from "./app/AppLifecycle.js";
import { AppModals } from "./app/AppModals.js";
import { AppShell } from "./app/AppShell.js";
import { TopBarModalContext } from "./app/topBarModalContext.js";
import { useAppHotkeys } from "./app/useAppHotkeys.js";
import { useFilesTreePreload } from "./app/useFilesTreePreload.js";
import { useKernelRestart } from "./app/useKernelRestart.js";
import { useTopBarModals } from "./app/useTopBarModals.js";
import {
  AgentSpawnProvider,
  useAgentSpawn,
} from "./hooks/useAgentSpawn.js";
import { FileDisplaySurfaceProvider } from "./shell/fileDisplaySurface.js";
import { surfaceFileDisplayInDock } from "./shell/dockLayout.js";
import { useStore } from "./state/store.js";

export { TopBarModalContext } from "./app/topBarModalContext.js";
export type { TopBarModalContextValue } from "./app/topBarModalContext.js";

export function App(): JSX.Element {
  const token = useStore((s) => s.token);
  const topBarModals = useTopBarModals();
  const kernelRestart = useKernelRestart(token);

  useAppHotkeys({
    devKernelRestartEnabled: kernelRestart.devKernelRestartEnabled,
    restartKernel: kernelRestart.restartKernel,
  });
  useFilesTreePreload(token);

  /* App-level agent-spawn state. Lifted here so TopBar's `+` menu and the
     empty-session AgentLauncher share the same preflight + setup-modal
     state. Both consume via useAgentSpawnContext(). */
  const agentSpawn = useAgentSpawn();

  return (
    <TopBarModalContext.Provider value={topBarModals.contextValue}>
      <AgentSpawnProvider value={agentSpawn}>
        <AppLifecycle
          setDevKernelRestartEnabled={kernelRestart.setDevKernelRestartEnabled}
        />
        <FileDisplaySurfaceProvider value={surfaceFileDisplayInDock}>
          <div className="app">
            <AppShell
              devKernelRestartEnabled={kernelRestart.devKernelRestartEnabled}
              kernelRestartState={kernelRestart.kernelRestartState}
              onRestartKernel={kernelRestart.restartKernel}
            />
            <AppModals topBarModals={topBarModals} />
          </div>
        </FileDisplaySurfaceProvider>
      </AgentSpawnProvider>
    </TopBarModalContext.Provider>
  );
}
