import { type JSX } from "react";
import { Settings2 } from "lucide-react";
import { Popover } from "../popovers/Popover.js";

interface Props {
  anchorRect: DOMRect | null;
  onClose(): void;
  messageEndsTurn: boolean;
  onMessageEndsTurnChange(value: boolean): void;
  enterToSend: boolean;
  onEnterToSendChange(value: boolean): void;
}

export function ComposeSettingsPopover({
  anchorRect,
  onClose,
  messageEndsTurn,
  onMessageEndsTurnChange,
  enterToSend,
  onEnterToSendChange,
}: Props): JSX.Element {
  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-end"
      onClose={onClose}
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
            checked={enterToSend}
            onChange={(e) => onEnterToSendChange(e.target.checked)}
          />
          <span className="toggle-label">Enter to send (or Enter + ⌘)</span>
        </label>
      </div>
    </Popover>
  );
}
