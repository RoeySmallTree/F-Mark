/* SendButton — the primary action at the right edge of the compose row.

   Design: a single bordered "send-cluster" pill that always presents the
   user's act-of-finishing as one confident control. The cluster has two
   slots:
     - Send (left)      — only visible when textarea has content.
     - End turn (right) — always visible.

   Mode behavior:
     - comment            → [Post comment]                       (single button, no cluster)
     - named              → [End turn]                           (single button, no cluster)
     - message + content  → [Send  ⌘↵ | End turn]                (cluster, both slots)
     - message + empty    → [End turn]                           (cluster, single slot)
*/

import { type JSX } from "react";
import { CornerDownLeft } from "lucide-react";
import { readEnterToSend } from "../state/settings.js";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";

interface Props {
  mode: "message" | "named" | "comment";
  canSubmit: boolean;
  busy: boolean;
  hasContent: boolean;
  onSubmit(): void;
  onEndTurn(): void;
}

export function SendButton({
  mode,
  canSubmit,
  busy,
  hasContent,
  onSubmit,
  onEndTurn,
}: Props): JSX.Element {
  const enterToSend = readEnterToSend();
  const sendShortcut = enterToSend ? "↵" : chordToLabel("$mod+Enter");

  if (mode === "comment") {
    return (
      <button
        type="button"
        className="send-btn standalone"
        onClick={onSubmit}
        disabled={busy || !canSubmit}
        aria-label="Post comment"
      >
        Post comment
        <span className="kbd">{sendShortcut}</span>
      </button>
    );
  }

  if (mode === "named") {
    return (
      <button
        type="button"
        className="send-btn standalone"
        onClick={onSubmit}
        disabled={busy || !canSubmit}
        aria-label="End turn with named contribution"
      >
        End turn
        <CornerDownLeft size={14} aria-hidden />
        <span className="kbd">{sendShortcut}</span>
      </button>
    );
  }

  /* message mode → cluster with Send (when content) + End-turn (always). */
  const sendDisabled = busy || !canSubmit;
  return (
    <div
      className={`send-cluster${hasContent ? " has-send" : " empty"}`}
      role="group"
      aria-label="Send and end-turn actions"
    >
      {hasContent && (
        <button
          type="button"
          className="send-btn send-cluster-send"
          onClick={onSubmit}
          disabled={sendDisabled}
          aria-label="Send message"
        >
          Send
          <CornerDownLeft size={13} aria-hidden className="send-cluster-icon" />
          <span className="kbd">{sendShortcut}</span>
        </button>
      )}
      <button
        type="button"
        className="end-turn-btn"
        onClick={onEndTurn}
        disabled={busy}
        aria-label="End turn"
        title={
          hasContent
            ? "End turn without sending"
            : "End your turn without posting anything"
        }
      >
        End turn
      </button>
    </div>
  );
}

