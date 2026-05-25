/* AgentActionMenu — the action surface that opens when an AgentChip is
   clicked. Rendered by the chip's parent (TopBar in a later task).

   Layout: a flex column of action buttons. Some actions ("Rename",
   "Send a message", "Say goodbye") open an inline edit/confirm UI in
   place of their button. Conditional items (Reconnect, Show last failure,
   Say goodbye) are omitted entirely when their condition is false.

   v0.4 keeps the visuals simple — plain text buttons with consistent
   spacing; the destructive Say goodbye is tinted via .destructive. */

import { useCallback, useState, type JSX, type KeyboardEvent } from "react";
import type { PresenceState } from "@f-mark/shared";
import "./chips.css";

export interface AgentActionMenuProps {
  participantId: string;
  name: string;
  state: PresenceState;
  managed: boolean;
  onRename(newName: string): void;
  onCompact(): void;
  onSlash(command: string): void;
  onInterrupt(): void;
  onMessage(text: string): void;
  onOpenTerminal(): void;
  onReconnect(): void;
  onInstallHooks?(): void;
  onShowLogs(): void;
  onSayGoodbye(): void;
}

type EditMode = "none" | "rename" | "message" | "slash" | "confirm-goodbye";

export function AgentActionMenu({
  participantId,
  name,
  state,
  managed,
  onRename,
  onCompact,
  onSlash,
  onInterrupt,
  onMessage,
  onOpenTerminal,
  onReconnect,
  onInstallHooks,
  onShowLogs,
  onSayGoodbye,
}: AgentActionMenuProps): JSX.Element {
  const [mode, setMode] = useState<EditMode>("none");
  const [renameValue, setRenameValue] = useState(name);
  const [messageValue, setMessageValue] = useState("");

  const compactDisabled = state !== "online" || !managed;
  const compactReason = !managed
    ? "Not a managed agent"
    : state !== "online"
      ? "Agent is not online"
      : undefined;

  const interruptDisabled =
    !managed || state === "offline" || state === "pane-dead";
  const interruptReason = !managed
    ? "Not a managed agent"
    : state === "offline"
      ? "Agent is offline"
      : state === "pane-dead"
        ? "Pane has exited"
        : undefined;

  const showReconnect = state === "offline" || state === "pane-dead";
  const showInstallHooks = state === "hook-not-installed";

  const submitRename = useCallback((): void => {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0) return;
    onRename(trimmed);
    setMode("none");
  }, [renameValue, onRename]);

  const submitMessage = useCallback((): void => {
    const trimmed = messageValue.trim();
    if (trimmed.length === 0) return;
    onMessage(trimmed);
    setMessageValue("");
    setMode("none");
  }, [messageValue, onMessage]);

  function onRenameKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      submitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMode("none");
      setRenameValue(name);
    }
  }

  function onMessageKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      submitMessage();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMode("none");
      setMessageValue("");
    }
  }

  return (
    <div
      className="agent-action-menu"
      role="menu"
      aria-label={`Actions for ${name}`}
      data-participant-id={participantId}
    >
      <div className="agent-action-menu-head">{name}</div>

      {/* Rename — inline edit when mode === 'rename'. */}
      {mode === "rename" ? (
        <div className="agent-action-menu-rename">
          <input
            type="text"
            aria-label="New name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={onRenameKey}
            autoFocus
          />
          <button type="button" onClick={submitRename}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("none");
              setRenameValue(name);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="agent-action-menu-item"
          onClick={() => {
            setRenameValue(name);
            setMode("rename");
          }}
        >
          Rename
        </button>
      )}

      <button
        type="button"
        role="menuitem"
        className="agent-action-menu-item"
        disabled={compactDisabled}
        title={compactReason}
        onClick={onCompact}
      >
        Send /compact (best effort)
      </button>

      {managed ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="agent-action-menu-item"
            aria-expanded={mode === "slash"}
            onClick={() =>
              setMode((m) => (m === "slash" ? "none" : "slash"))
            }
          >
            Slash commands…
          </button>
          {mode === "slash" ? (
            <div className="agent-action-menu-sub">
              <button
                type="button"
                role="menuitem"
                className="agent-action-menu-item"
                onClick={() => {
                  onSlash("clear");
                  setMode("none");
                }}
              >
                /clear
              </button>
              <button
                type="button"
                role="menuitem"
                className="agent-action-menu-item"
                onClick={() => {
                  onSlash("resume");
                  setMode("none");
                }}
              >
                /resume
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        role="menuitem"
        className="agent-action-menu-item"
        disabled={interruptDisabled}
        title={interruptReason}
        onClick={onInterrupt}
      >
        Interrupt (Ctrl-C)
      </button>

      {managed ? (
        mode === "message" ? (
          <div className="agent-action-menu-msg">
            <input
              type="text"
              aria-label="Message text"
              value={messageValue}
              onChange={(e) => setMessageValue(e.target.value)}
              onKeyDown={onMessageKey}
              placeholder="Type a message…"
              autoFocus
            />
            <button type="button" onClick={submitMessage}>
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("none");
                setMessageValue("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            role="menuitem"
            className="agent-action-menu-item"
            onClick={() => setMode("message")}
          >
            Send a message…
          </button>
        )
      ) : null}

      {managed ? (
        <button
          type="button"
          role="menuitem"
          className="agent-action-menu-item"
          onClick={onOpenTerminal}
        >
          Open terminal
        </button>
      ) : null}

      {showReconnect ? (
        <button
          type="button"
          role="menuitem"
          className="agent-action-menu-item"
          onClick={onReconnect}
        >
          Reconnect
        </button>
      ) : null}

      {showInstallHooks && onInstallHooks !== undefined ? (
        <button
          type="button"
          role="menuitem"
          className="agent-action-menu-item"
          onClick={onInstallHooks}
        >
          Install hooks
        </button>
      ) : null}

      {managed ? (
        <button
          type="button"
          role="menuitem"
          className="agent-action-menu-item"
          onClick={onShowLogs}
        >
          Show last failure
        </button>
      ) : null}

      {managed ? (
        mode === "confirm-goodbye" ? (
          <div className="agent-action-menu-confirm">
            <span>Say goodbye to {name}?</span>
            <button
              type="button"
              className="confirm-yes"
              aria-label="Confirm goodbye"
              onClick={() => {
                onSayGoodbye();
                setMode("none");
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className="confirm-no"
              aria-label="Cancel goodbye"
              onClick={() => setMode("none")}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="agent-action-menu-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="agent-action-menu-item destructive"
              onClick={() => setMode("confirm-goodbye")}
            >
              Say goodbye
            </button>
          </>
        )
      ) : null}
    </div>
  );
}
