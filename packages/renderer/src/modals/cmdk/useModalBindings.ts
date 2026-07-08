import { useStore } from "../../state/store.js";

export function useCmdKModalBindings() {
  return {
    activePath: useStore((state) => state.activePath),
    closeModal: useStore((state) => state.closeModal),
    currentSessionId: useStore((state) => state.currentSessionId),
    events: useStore((state) => state.events),
    openModal: useStore((state) => state.openModal),
    sessions: useStore((state) => state.sessions),
    setCurrentSession: useStore((state) => state.setCurrentSession),
    setParticipants: useStore((state) => state.setParticipants),
    setPathsState: useStore((state) => state.setPathsState),
    setSessions: useStore((state) => state.setSessions),
    token: useStore((state) => state.token),
  };
}
