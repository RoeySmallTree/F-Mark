import {
  useCallback,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import type {
  AgentActionMenuActions,
  EditMode,
  SlashCommand,
} from "./types.js";
import { EDIT_MODES } from "./types.js";

const keyboardKeys = {
  enter: "Enter",
  escape: "Escape",
} as const;

interface AgentActionMenuActionInput {
  name: string;
  onRename(newName: string): void;
  onSlash(command: string): void;
  onMessage(text: string): void;
  onSayGoodbye(): void;
}

type SetMode = Dispatch<SetStateAction<EditMode>>;

export function useAgentActionMenuActions({
  name,
  onRename,
  onSlash,
  onMessage,
  onSayGoodbye,
}: AgentActionMenuActionInput): AgentActionMenuActions {
  const [mode, setMode] = useState<EditMode>(EDIT_MODES.none);
  const [renameValue, setRenameValue] = useState(name);
  const [messageValue, setMessageValue] = useState("");
  const rename = useRenameActions({
    name,
    renameValue,
    setRenameValue,
    setMode,
    onRename,
  });
  const slash = useSlashActions({ setMode, onSlash });
  const message = useMessageActions({
    messageValue,
    setMessageValue,
    setMode,
    onMessage,
  });
  const goodbye = useGoodbyeActions({ setMode, onSayGoodbye });

  return {
    mode,
    renameValue,
    messageValue,
    setRenameValue,
    setMessageValue,
    ...rename,
    ...slash,
    ...message,
    ...goodbye,
  };
}

interface RenameActionInput {
  name: string;
  renameValue: string;
  setRenameValue(value: string): void;
  setMode: SetMode;
  onRename(newName: string): void;
}

function useRenameActions({
  name,
  renameValue,
  setRenameValue,
  setMode,
  onRename,
}: RenameActionInput): Pick<
  AgentActionMenuActions,
  "openRename" | "cancelRename" | "submitRename" | "onRenameKey"
> {
  const openRename = useCallback((): void => {
    setRenameValue(name);
    setMode(EDIT_MODES.rename);
  }, [name, setRenameValue, setMode]);

  const cancelRename = useCallback((): void => {
    setMode(EDIT_MODES.none);
    setRenameValue(name);
  }, [name, setRenameValue, setMode]);

  const submitRename = useCallback((): void => {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0) return;
    onRename(trimmed);
    setMode(EDIT_MODES.none);
  }, [renameValue, onRename, setMode]);

  const onRenameKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === keyboardKeys.enter) {
        e.preventDefault();
        submitRename();
      } else if (e.key === keyboardKeys.escape) {
        e.preventDefault();
        cancelRename();
      }
    },
    [submitRename, cancelRename],
  );

  return { openRename, cancelRename, submitRename, onRenameKey };
}

interface SlashActionInput {
  setMode: SetMode;
  onSlash(command: string): void;
}

function useSlashActions({
  setMode,
  onSlash,
}: SlashActionInput): Pick<
  AgentActionMenuActions,
  "toggleSlash" | "runSlash"
> {
  const toggleSlash = useCallback((): void => {
    setMode((current) =>
      current === EDIT_MODES.slash ? EDIT_MODES.none : EDIT_MODES.slash,
    );
  }, [setMode]);

  const runSlash = useCallback(
    (command: SlashCommand): void => {
      onSlash(command);
      setMode(EDIT_MODES.none);
    },
    [onSlash, setMode],
  );

  return { toggleSlash, runSlash };
}

interface MessageActionInput {
  messageValue: string;
  setMessageValue(value: string): void;
  setMode: SetMode;
  onMessage(text: string): void;
}

function useMessageActions({
  messageValue,
  setMessageValue,
  setMode,
  onMessage,
}: MessageActionInput): Pick<
  AgentActionMenuActions,
  "openMessage" | "cancelMessage" | "submitMessage" | "onMessageKey"
> {
  const openMessage = useCallback((): void => {
    setMode(EDIT_MODES.message);
  }, [setMode]);

  const cancelMessage = useCallback((): void => {
    setMode(EDIT_MODES.none);
    setMessageValue("");
  }, [setMessageValue, setMode]);

  const submitMessage = useCallback((): void => {
    const trimmed = messageValue.trim();
    if (trimmed.length === 0) return;
    onMessage(trimmed);
    setMessageValue("");
    setMode(EDIT_MODES.none);
  }, [messageValue, onMessage, setMessageValue, setMode]);

  const onMessageKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === keyboardKeys.enter) {
        e.preventDefault();
        submitMessage();
      } else if (e.key === keyboardKeys.escape) {
        e.preventDefault();
        cancelMessage();
      }
    },
    [submitMessage, cancelMessage],
  );

  return { openMessage, cancelMessage, submitMessage, onMessageKey };
}

interface GoodbyeActionInput {
  setMode: SetMode;
  onSayGoodbye(): void;
}

function useGoodbyeActions({
  setMode,
  onSayGoodbye,
}: GoodbyeActionInput): Pick<
  AgentActionMenuActions,
  "requestGoodbye" | "confirmGoodbye" | "cancelMode"
> {
  const cancelMode = useCallback((): void => {
    setMode(EDIT_MODES.none);
  }, [setMode]);

  const requestGoodbye = useCallback((): void => {
    setMode(EDIT_MODES.confirmGoodbye);
  }, [setMode]);

  const confirmGoodbye = useCallback((): void => {
    onSayGoodbye();
    setMode(EDIT_MODES.none);
  }, [onSayGoodbye, setMode]);

  return { requestGoodbye, confirmGoodbye, cancelMode };
}
