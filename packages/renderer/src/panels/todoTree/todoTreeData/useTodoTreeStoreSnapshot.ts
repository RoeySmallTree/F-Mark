import { useStore } from "../../../state/store.js";
import type { TodoTreeStoreSnapshot } from "./types.js";

export function useTodoTreeStoreSnapshot(): TodoTreeStoreSnapshot {
  const currentSessionId = useStore((state) => state.currentSessionId);
  const token = useStore((state) => state.token);
  const actorId = useStore((state) => state.currentUserId);
  const participants = useStore((state) => state.participants);
  const events = useStore((state) => state.events);

  return {
    currentSessionId,
    token,
    actorId,
    participants,
    events,
  };
}
