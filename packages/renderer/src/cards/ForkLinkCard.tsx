import type { JSX } from "react";
import { GitFork } from "lucide-react";
import type { ForkLinkEventRecord } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { useStore } from "../state/store.js";

interface Props {
  event: ForkLinkEventRecord;
}

/* Quiet inline system card marking a fork link. Authored by `sys-fork`,
   appears at the chronological fork instant in both source and fork
   sessions, click navigates to the linked session (path-switch first
   when needed; v1 always same-root). Visual weight intentionally
   between TurnEndDivider and a soft banner — no warning colors, no
   participant stripe. */
export function ForkLinkCard({ event }: Props): JSX.Element {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setPathsState = useStore((s) => s.setPathsState);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);

  const { direction, other_session_id, other_session_slug, other_path } =
    event.payload;
  const label = direction === "from" ? "Forked from" : "Forked to";

  async function navigate(): Promise<void> {
    try {
      if (other_path !== undefined && other_path !== activePath) {
        const client = createClient({ baseUrl: "", token });
        const nextPaths = await client.setActivePath(other_path);
        setPathsState(nextPaths);
        const [sessions, participants] = await Promise.all([
          client.listSessions(),
          client.listParticipants(),
        ]);
        setSessions(sessions);
        setParticipants(participants);
      }
      setCurrentSession(other_session_id);
    } catch {
      // Silent navigation failure; leaves the user in the current session.
    }
  }

  return (
    <button
      type="button"
      className="fork-link-card"
      onClick={() => void navigate()}
      aria-label={`${label} session ${other_session_slug}`}
      data-direction={direction}
    >
      <GitFork size={12} aria-hidden />
      <span className="fork-link-label">{label}</span>
      <span className="fork-link-slug">{other_session_slug}</span>
    </button>
  );
}
