/* SendButton — the primary action in the compose bar.

   Label rule (mirrors app.jsx / panels.jsx ComposeBar):
     - mode='message' and content empty → "End turn" (outline) → triggers turn-end.
     - mode='message' with content       → "Send"           → submit.
     - mode='named'                      → "End turn" (primary) → submit.
     - mode='comment'                    → "Post comment"   → submit.

   The button is always interactive — when content is empty in message mode we
   fall through to onEndTurn(). When the active submission isn't allowed
   (no session/user/etc.), the button shows disabled. */

import { type JSX } from "react";
import { ArrowRight } from "lucide-react";

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
  // Decide the action + label per mode.
  let label: string;
  let action: () => void;
  let outline = false;
  if (mode === "comment") {
    label = "Post comment";
    action = onSubmit;
  } else if (mode === "named") {
    label = "End turn";
    action = onSubmit;
  } else if (hasContent) {
    label = "Send";
    action = onSubmit;
  } else {
    // mode='message', no content → button acts as "End turn" (outline).
    label = "End turn";
    action = onEndTurn;
    outline = true;
  }

  // When the action requires submit, gate on canSubmit; the "End turn" path
  // doesn't need content so it stays enabled.
  const needsSubmit = action === onSubmit;
  const disabled = busy || (needsSubmit && !canSubmit);

  return (
    <button
      type="button"
      className={["send-btn", outline ? "outline" : ""].join(" ").trim()}
      onClick={action}
      disabled={disabled}
      aria-label={label}
    >
      {label}
      {mode !== "comment" && <ArrowRight size={12} aria-hidden />}
      <span className="kbd">⌘↵</span>
    </button>
  );
}
