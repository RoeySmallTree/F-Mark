import { useStore } from "../../state/store.js";
import { useAllSessionEvents } from "../allSessions.js";
import {
  currentTodoScope,
  visibleTodoPathGroups,
} from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  todo: "todo",
} as const;

export function useTodosPanelModel(): {
  currentPath: string;
  currentSession: ReturnType<typeof currentTodoScope>["currentSession"];
  error: string | null;
  loading: boolean;
  pathGroups: ReturnType<typeof visibleTodoPathGroups>;
  shouldRenderEditor: boolean;
} {
  const { groups, loading, error } = useAllSessionEvents([NO_LOOSE_STRING_VALUES.todo]);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const sessions = useStore((state) => state.sessions);
  const activePath = useStore((state) => state.activePath);
  const activePathId = useStore((state) => state.activePathId);
  const scope = currentTodoScope(currentSessionId, sessions, activePath);

  return {
    ...scope,
    error,
    loading,
    pathGroups: visibleTodoPathGroups(groups, currentSessionId, activePathId),
  };
}
