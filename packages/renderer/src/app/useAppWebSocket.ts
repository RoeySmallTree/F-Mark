import { useEffect } from "react";
import { connectWs } from "../api/ws.js";
import { useStore } from "../state/store.js";
import { AppSocketController } from "./AppSocketController.js";

export function useAppWebSocket(token: string | null): void {
  const setEvents = useStore((s) => s.setEvents);
  const mergeEvents = useStore((s) => s.mergeEvents);
  const dispatchManagedAgentWsMessage = useStore(
    (s) => s.dispatchManagedAgentWsMessage,
  );
  const setPathsState = useStore((s) => s.setPathsState);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setCurrentSession = useStore((s) => s.setCurrentSession);

  useEffect(() => {
    /* Single long-lived WS subscription gated on token only. Inside, the
       controller reads currentSessionId via useStore.getState() so a session
       switch doesn't force a reconnect (which used to drop messages mid-switch
       and miss path-switched broadcasts entirely). */
    const controller = new AppSocketController({
      token,
      getState: useStore.getState,
      setPathsState,
      setSessions,
      setParticipants,
      setCurrentSession,
      setEvents,
      mergeEvents,
      dispatchManagedAgentWsMessage,
    });
    const ws = connectWs(
      { baseUrl: "", token },
      (message) => {
        void controller.handleMessage(message);
      },
      (event) => {
        if (event.reconnected) void controller.backfillCurrentView();
      },
    );
    return () => {
      controller.dispose();
      ws.close();
    };
  }, [
    token,
    setEvents,
    mergeEvents,
    dispatchManagedAgentWsMessage,
    setPathsState,
    setSessions,
    setParticipants,
    setCurrentSession,
  ]);
}
