import { useStore } from "../state/store.js";
import { AgentLauncher } from "./AgentLauncher.js";
import { Feed } from "./Feed.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

/* The center "Messages" dock pane: the chat feed, or the empty-session agent
   launcher. The file viewer is now its own dock pane (`filesDisplay`), so this
   pane no longer swaps in a file-viewer shell. */
export function MessagesPane(): JSX.Element {
  const currentSessionId = useStore((s) => s.currentSessionId);
  const events = useStore((s) => s.events);
  const eventsLoadingSessionId = useStore((s) => s.eventsLoadingSessionId);
  const participants = useStore((s) => s.participants);
  const eventsLoading =
    currentSessionId !== null && eventsLoadingSessionId === currentSessionId;
  const showAgentLauncher =
    currentSessionId !== null &&
    events.length === 0 &&
    !eventsLoading &&
    !Object.values(participants).some(
      (p) => p.kind === NO_LOOSE_STRING_VALUES.agent && p.active_session === currentSessionId,
    );

  return showAgentLauncher ? (
    <AgentLauncher />
  ) : (
    <section className="feed-col" aria-label="Feed">
      <Feed />
    </section>
  );
}
