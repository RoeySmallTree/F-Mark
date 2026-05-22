/* ModeBar — three mode pills (Message / Named / Comment) used inside the
   compose-actions row. Each pill mirrors `.mode-btn` from design.html and
   shows a small ⌘-kbd hint per the prototype.

   Behavior:
   - Clicking the active mode goes back to 'message' (toggle behavior, matches
     the app.jsx prototype: `setMode(isComment ? 'message' : 'comment')`).
   - The Comment pill is disabled when there's no `commentTarget` — without
     a target, there's nothing to comment on. It still renders so users can
     see the keybinding hint.
*/

import { type JSX } from "react";
import { FileText, MessageSquare } from "lucide-react";
import { useStore } from "../state/store.js";

const PILLS = [
  { id: "message" as const, label: "Message", kbd: "⌘/" },
  { id: "named" as const, label: "Name it", kbd: "⌘N" },
  { id: "comment" as const, label: "Comment", kbd: "⌘/" },
];

export function ModeBar(): JSX.Element {
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const commentTarget = useStore((s) => s.commentTarget);
  const commentEnabled = commentTarget !== null;

  function onClick(id: "message" | "named" | "comment"): void {
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
            <MessageSquare size={11} aria-hidden />
          ) : p.id === "named" ? (
            <FileText size={11} aria-hidden />
          ) : null;
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
            <span className="kbd">{p.kbd}</span>
          </button>
        );
      })}
    </>
  );
}
