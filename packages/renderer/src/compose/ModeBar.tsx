/* ModeBar — mode pills for the compose-actions row.

   The Message mode pill was removed in the cluster-redesign pass: the
   Send button on the right edge of the compose row is the message-mode
   action verb, so a left-side "Message" toggle pill was a duplicate.
   The Message MODE itself still exists in the store and is the implicit
   default; clicking an active Name-it or Comment pill flips back to it.

   Behavior:
   - Two pills: Name it (⌘N) and Comment (⌘/).
   - Clicking the active pill flips composeMode back to "message".
   - The Comment pill is disabled when there's no commentTarget — without
     a target there's nothing to comment on. It still renders so users
     see the keybinding hint and the disabled affordance. */

import { type JSX } from "react";
import { FileText, MessageSquare } from "lucide-react";
import { useStore } from "../state/store.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";

const PILLS = [
  { id: "named" as const, label: "Name it", combo: "$mod+N" },
  { id: "comment" as const, label: "Comment", combo: "$mod+/" },
];

export function ModeBar(): JSX.Element {
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const commentTarget = useStore((s) => s.commentTarget);
  const commentEnabled = commentTarget !== null;

  function onClick(id: "named" | "comment"): void {
    if (id === "comment" && !commentEnabled) return;
    if (mode === id) {
      setMode("message");
    } else {
      setMode(id);
    }
  }

  return (
    <>
      {PILLS.map((p) => {
        const active = mode === p.id;
        const disabled = p.id === "comment" && !commentEnabled;
        const icon =
          p.id === "comment" ? (
            <MessageSquare size={13} aria-hidden />
          ) : (
            <FileText size={13} aria-hidden />
          );
        return (
          <button
            key={p.id}
            type="button"
            className={["mode-btn", active ? "active" : ""].join(" ").trim()}
            aria-pressed={active}
            aria-label={`${p.label} mode`}
            disabled={disabled}
            title={
              disabled
                ? "Pick a comment target from a card first"
                : `Switch to ${p.label} mode`
            }
            onClick={() => onClick(p.id)}
          >
            {icon}
            {p.label}
            <span className="kbd">{chordToLabel(p.combo)}</span>
          </button>
        );
      })}
    </>
  );
}
