import { type JSX } from "react";
import { Settings2 } from "lucide-react";
import { Popover } from "../popovers/Popover.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
  closing?: boolean;
  messageEndsTurn: boolean;
  onMessageEndsTurnChange(value: boolean): void;
  commentEndsTurn: boolean;
  onCommentEndsTurnChange(value: boolean): void;
  choiceEndsTurn: boolean;
  onChoiceEndsTurnChange(value: boolean): void;
  enterToSend: boolean;
  onEnterToSendChange(value: boolean): void;
}

export function ComposeSettingsPopover({
  anchorRect,
  onClose,
  closing = false,
  messageEndsTurn,
  onMessageEndsTurnChange,
  commentEndsTurn,
  onCommentEndsTurnChange,
  choiceEndsTurn,
  onChoiceEndsTurnChange,
  enterToSend,
  onEnterToSendChange,
}: Props): JSX.Element {
  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-end"
      onClose={onClose}
      closing={closing}
      className="compose-settings-pop"
      ariaLabel="Compose settings"
    >
      <div className="pop-head">
        <Settings2 size={14} aria-hidden style={{ color: "var(--ink-2)" }} />
        Compose Settings
      </div>
      <div className="pop-section">
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={messageEndsTurn}
            onChange={(e) => onMessageEndsTurnChange(e.target.checked)}
          />
          <span className="toggle-label">Send ends turn automatically</span>
        </label>
        <label className="settings-toggle mt-3">
          <input
            type="checkbox"
            checked={commentEndsTurn}
            onChange={(e) => onCommentEndsTurnChange(e.target.checked)}
          />
          <span className="toggle-label">Comments end turn automatically</span>
        </label>
        <label className="settings-toggle mt-3">
          <input
            type="checkbox"
            checked={choiceEndsTurn}
            onChange={(e) => onChoiceEndsTurnChange(e.target.checked)}
          />
          <span className="toggle-label">
            Choosing options ends turn automatically
          </span>
        </label>
        <label className="settings-toggle mt-3">
          <input
            type="checkbox"
            checked={enterToSend}
            onChange={(e) => onEnterToSendChange(e.target.checked)}
          />
          <span className="toggle-label">Enter to send (or Enter + ⌘)</span>
        </label>
      </div>
    </Popover>
  );
}
