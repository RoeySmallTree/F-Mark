import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import type { ManagedAgentsStatusResponse } from "@f-mark/shared";
import type { ForkSessionResponse, SessionMeta } from "../../api/client.js";
import { createClient } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import type { State } from "../../state/storeTypes.js";
import { forkSessionRequest, shouldCloseAfterFork } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  connected: "connected",
} as const;

type ForkRefreshBridge = Pick<
  State,
  | "token"
  | "setCurrentSession"
  | "setSessions"
  | "setParticipants"
  | "setPathsState"
  | "setManagedAgents"
>;

interface SubmitForkSessionInput extends ForkRefreshBridge {
  activePath: string | null;
  target: SessionMeta;
  name: string;
  inputRef: RefObject<HTMLInputElement>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setResult: Dispatch<SetStateAction<ForkSessionResponse | null>>;
  onClose(): void;
  onForked?(response: ForkSessionResponse): void;
}

export async function submitForkSession({
  activePath,
  target,
  name,
  inputRef,
  setBusy,
  setError,
  setResult,
  onClose,
  onForked,
  ...bridge
}: SubmitForkSessionInput): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    setError("Name is required.");
    inputRef.current?.focus();
    return;
  }

  setBusy(true);
  setError(null);
  try {
    const client = createClient({ baseUrl: "", token: bridge.token });
    const response = await client.forkSession(
      target.id,
      forkSessionRequest(target, trimmed, activePath),
    );
    await refreshForkSessionState(response, bridge);
    setResult(response);
    onForked?.(response);
    if (shouldCloseAfterFork(response)) onClose();
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setBusy(false);
  }
}

async function refreshForkSessionState(
  response: ForkSessionResponse,
  bridge: ForkRefreshBridge,
): Promise<void> {
  const client = createClient({ baseUrl: "", token: bridge.token });
  const managed = createManagedAgentsClient({ baseUrl: "", token: bridge.token });

  try {
    bridge.setPathsState(await client.getPaths());
  } catch {
    // Older kernels do not expose multi-path state.
  }

  const [sessions, participants, status] = await Promise.all([
    client.listSessions(),
    client.listParticipants(),
    managed.status().catch(() => null),
  ]);
  bridge.setSessions(sessions);
  bridge.setParticipants(participants);
  if (status !== null) bridge.setManagedAgents(statusToManagedAgents(status));
  /* Pass the fork's root so a cross-root fork selects under its own project
     rather than falling back to the stale active path (spawn 404 otherwise). */
  bridge.setCurrentSession(response.session.id, response.session);
}

function statusToManagedAgents(
  status: ManagedAgentsStatusResponse,
): Parameters<State["setManagedAgents"]>[0] {
  return status.agents.map((agent) => ({
    participant_id: agent.participant_id,
    tmux_session: agent.tmux_session,
    runtime_id: agent.runtime_id,
    runtime_session: agent.runtime_session,
    alive: agent.connection_state === NO_LOOSE_STRING_VALUES.connected,
    activity_state: agent.activity_state,
    runtime_state: agent.runtime_state,
  }));
}
