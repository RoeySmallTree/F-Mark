import { useEffect } from "react";
import { createClient, type Client } from "../api/client.js";
import { rootScopeForSession } from "../api/rootScope.js";
import {
  createManagedAgentsClient,
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
  type ManagedAgentsClient,
} from "../api/managedAgents.js";
import { useStore } from "../state/store.js";
import { chooseFocusedSessionAcrossPaths } from "../state/store.js";

interface BootstrapPathState {
  activePath: string | null;
  activePathId: string | null;
}

interface BootstrapSessionInput {
  client: Client;
  setPathsState: ReturnType<typeof useStore.getState>["setPathsState"];
  setSessions: ReturnType<typeof useStore.getState>["setSessions"];
  setParticipants: ReturnType<typeof useStore.getState>["setParticipants"];
  setCurrentSession: ReturnType<typeof useStore.getState>["setCurrentSession"];
}

interface ManagedAgentRefreshInput {
  client: Client;
  managedClient: ManagedAgentsClient;
  setDevKernelRestartEnabled(enabled: boolean): void;
  setManagedAgents: ReturnType<typeof useStore.getState>["setManagedAgents"];
  setManagedTerminals: ReturnType<typeof useStore.getState>["setManagedTerminals"];
  setManagedAgentsDisabledReason: ReturnType<
    typeof useStore.getState
  >["setManagedAgentsDisabledReason"];
}

interface ManagedAgentListInput {
  managedClient: ManagedAgentsClient;
  processApiEnabled: boolean | null;
  setManagedAgents: ManagedAgentRefreshInput["setManagedAgents"];
  setManagedTerminals: ManagedAgentRefreshInput["setManagedTerminals"];
  setManagedAgentsDisabledReason: ManagedAgentRefreshInput["setManagedAgentsDisabledReason"];
}

async function readBootstrapPathState(
  client: Client,
  setPathsState: BootstrapSessionInput["setPathsState"],
): Promise<BootstrapPathState> {
  try {
    const paths = await client.getPaths();
    setPathsState(paths);
    return { activePath: paths.activePath, activePathId: paths.activePathId };
  } catch {
    /* legacy kernel; behave as if cwd is active */
    return { activePath: "", activePathId: null };
  }
}

async function listBootstrapSessions(client: Client): Promise<
  Awaited<ReturnType<Client["listAllSessions"]>>
> {
  try {
    return await client.listAllSessions();
  } catch {
    try {
      return await client.listSessions();
    } catch {
      return [];
    }
  }
}

async function bootstrapSessionsAndParticipants(
  input: BootstrapSessionInput,
): Promise<void> {
  /* Read multi-path state first so the rest of the bootstrap knows
     which path to scope sessions/participants to. Kernels prior to
     v0.5 don't expose /paths — treat any error here as "no path
     state", and fall through to the legacy sessions/participants
     fetch so the renderer keeps working against an old kernel. */
  const { activePath, activePathId } = await readBootstrapPathState(
    input.client,
    input.setPathsState,
  );
  const list = await listBootstrapSessions(input.client);
  input.setSessions(list);

  const state = useStore.getState();
  const selected = chooseFocusedSessionAcrossPaths(
    list,
    state.currentSessionId,
    state.selectedPathId,
    state.selectedPath,
  );
  if (selected === null) {
    input.setParticipants({});
    input.setCurrentSession(null);
    return;
  }

  input.setCurrentSession(selected.id, selected);
  const scope = rootScopeForSession(selected, activePathId, activePath);
  try {
    input.setParticipants(await input.client.listParticipants(scope ?? undefined));
  } catch {
    input.setParticipants({});
  }
}

async function readProcessApiState(
  input: Pick<
    ManagedAgentRefreshInput,
    "client" | "setDevKernelRestartEnabled"
  >,
): Promise<boolean | null> {
  try {
    const health = await input.client.health();
    input.setDevKernelRestartEnabled(health.devKernelRestartEnabled === true);
    return health.processApiEnabled ?? null;
  } catch {
    /* Older kernels still support the managed-agent probe below. */
    input.setDevKernelRestartEnabled(false);
    return null;
  }
}

function applyManagedAgentList(
  input: Omit<ManagedAgentListInput, "managedClient" | "processApiEnabled">,
  result: Awaited<ReturnType<ManagedAgentsClient["list"]>>,
): void {
  if (Array.isArray(result?.agents)) input.setManagedAgents(result.agents);
  if (Array.isArray(result?.terminals)) {
    input.setManagedTerminals(result.terminals);
  }
  input.setManagedAgentsDisabledReason(null);
}

function handleManagedAgentListError(
  input: Pick<ManagedAgentListInput, "setManagedAgentsDisabledReason">,
  err: unknown,
): void {
  if (isProcessApiDisabledError(err)) {
    input.setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
  }
}

async function refreshManagedAgentList(
  input: ManagedAgentListInput,
): Promise<void> {
  if (input.processApiEnabled === false) {
    input.setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
    return;
  }
  try {
    applyManagedAgentList(input, await input.managedClient.list());
  } catch (err) {
    handleManagedAgentListError(input, err);
  }
}

async function refreshManagedAgentState(
  input: ManagedAgentRefreshInput,
): Promise<void> {
  /* Fetch managed-agent state in a best-effort pass. If the endpoint or
     process API is unavailable, the renderer continues without chip/banner
     data and records a disabled reason only when the kernel says so. */
  const processApiEnabled = await readProcessApiState(input);
  await refreshManagedAgentList({ ...input, processApiEnabled });
}

function hasEnvProbeRuntimes(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const runtimes = (value as { runtimes?: unknown }).runtimes;
  return runtimes !== null && typeof runtimes === "object";
}

async function refreshEnvProbe(input: {
  managedClient: ManagedAgentsClient;
  setEnvProbe: ReturnType<typeof useStore.getState>["setEnvProbe"];
}): Promise<void> {
  try {
    const r = await input.managedClient.envProbe();
    if (hasEnvProbeRuntimes(r)) input.setEnvProbe(r);
  } catch {
    /* swallow */
  }
}

export function useAppBootstrap({
  token,
  setDevKernelRestartEnabled,
}: {
  token: string | null;
  setDevKernelRestartEnabled(enabled: boolean): void;
}): void {
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setManagedAgents = useStore((s) => s.setManagedAgents);
  const setManagedTerminals = useStore((s) => s.setManagedTerminals);
  const setManagedAgentsDisabledReason = useStore(
    (s) => s.setManagedAgentsDisabledReason,
  );
  const setEnvProbe = useStore((s) => s.setEnvProbe);
  const setPathsState = useStore((s) => s.setPathsState);

  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    const managedClient = createManagedAgentsClient({
      baseUrl: "",
      token,
    });
    void bootstrapSessionsAndParticipants({
      client,
      setPathsState,
      setSessions,
      setParticipants,
      setCurrentSession,
    });
    void refreshManagedAgentState({
      client,
      managedClient,
      setDevKernelRestartEnabled,
      setManagedAgents,
      setManagedTerminals,
      setManagedAgentsDisabledReason,
    });
    void refreshEnvProbe({ managedClient, setEnvProbe });
  }, [
    token,
    setDevKernelRestartEnabled,
    setSessions,
    setParticipants,
    setCurrentSession,
    setManagedAgents,
    setManagedTerminals,
    setManagedAgentsDisabledReason,
    setEnvProbe,
    setPathsState,
  ]);
}
