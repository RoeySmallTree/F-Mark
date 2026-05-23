/* SendButton — the right-side action cluster in the compose bar.

   Design: a single bordered cluster ("send-cluster") that visually fuses
   Send + End-turn as one tightly-coupled control. The "ends turn" state
   lives as a clickable Link/Unlink glyph BETWEEN the two halves — the
   chain icon literally reads as "Send chains into End-turn". Click the
   chain to break it; click again to re-link.

   Layouts:
     - comment            → [Post comment]                       (single)
     - named              → [End turn]                            (single)
     - message + content  → [Send  ⌘↵ | ⛓ | End turn]            (cluster)
     - message + empty    → [End turn]                            (cluster, collapsed)
*/

import { type JSX } from "react";
import { CornerDownLeft, Link2, Unlink2 } from "lucide-react";
import { chordToLabel } from "../modals/settings/shortcut-registry.js";

const SEND_SHORTCUT = chordToLabel("$mod+Enter");

interface Props {
  mode: "message" | "named" | "comment";
  canSubmit: boolean;
  busy: boolean;
  hasContent: boolean;
  messageEndsTurn: boolean;
  onMessageEndsTurnChange(next: boolean): void;
  /* In message mode the parent's onSubmit already chains submit → endTurn
     when messageEndsTurn=true, so SendButton stays a dumb view component. */
  onSubmit(): void;
  onEndTurn(): void;
}

export function SendButton({
  mode,
  canSubmit,
  busy,
  hasContent,
  messageEndsTurn,
  onMessageEndsTurnChange,
  onSubmit,
  onEndTurn,
}: Props): JSX.Element {
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
        <span className="kbd">{SEND_SHORTCUT}</span>
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
        <CornerDownLeft size={12} aria-hidden />
        <span className="kbd">{SEND_SHORTCUT}</span>
      </button>
    );
  }

  /* message mode → unified cluster: Send · chain · End-turn. */
  const sendDisabled = busy || !canSubmit;
  const chainOn = messageEndsTurn;
  return (
    <div
      className={`send-cluster${chainOn ? " chained" : " unchained"}${
        hasContent ? " has-send" : " empty"
      }`}
      role="group"
      aria-label="Send and end-turn actions"
    >
      {hasContent && (
        <button
          type="button"
          className="send-btn send-cluster-send"
          onClick={onSubmit}
          disabled={sendDisabled}
          aria-label={
            chainOn ? "Send message and end turn" : "Send message"
          }
        >
          <span className="send-cluster-send-label">Send</span>
          <CornerDownLeft size={11} aria-hidden className="send-cluster-icon" />
          <span className="kbd">{SEND_SHORTCUT}</span>
        </button>
      )}
      {hasContent && (
        <button
          type="button"
          className="send-chain"
          onClick={() => onMessageEndsTurnChange(!chainOn)}
          aria-pressed={chainOn}
          aria-label={
            chainOn
              ? "Chained: Send will end the turn. Click to unlink."
              : "Unlinked: Send only. Click to chain into End turn."
          }
          title={
            chainOn
              ? "Sending ends the turn — click to unlink"
              : "Send only — click to chain into End turn"
          }
        >
          {chainOn ? (
            <Link2 size={12} aria-hidden />
          ) : (
            <Unlink2 size={12} aria-hidden />
          )}
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
